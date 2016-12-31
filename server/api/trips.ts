import * as db from './db';
import { badRequest, jsonResponse, internalError, successResponse, AuthToken } from '../utils/requestUtils';
import * as models from './models';
import * as express from 'express';
import * as mongoose from 'mongoose';
import { Validator } from "validator.ts/Validator";
import { LoggerModule } from './logger';
import { DestinationContext } from '../destinationContext';

const log = new LoggerModule('trips');
const validator: Validator = new Validator();
type DatabaseResult<T> = db.DatabaseResult<T>;
type ITrip = models.ITrip;
type ObjectIdTs = models.ObjectIdTs;

async function handleTripCreate(req: express.Request,
                                res: express.Response,
                                authToken: AuthToken,
                                cont: (query: db.CreateTripQuery) => Promise<DatabaseResult<models.ITrip>>
                               ): Promise<models.ITripModel> {
    if (!req.body) {
        badRequest(res);
        return;
    }

    const toValidate = new models.Trip();
    for (let key in req.body) {
        toValidate[key] = req.body[key];
    }

    let tripRequest: models.Trip;
    try {
        tripRequest = await validator.sanitizeAndValidateAsync<models.Trip>(toValidate);
    } catch (e) {
        log.DEBUG('failed to validate trip:', toValidate, e.message);
        throw e;
    }

    const destinationContext: DestinationContext = DestinationContext.getInstance();
    if (!destinationContext.getAirportCodes().has(tripRequest.airport)) {
        throw new Error(`Airport ${tripRequest.airport} does not exist`);
    }
    if (!destinationContext.getColleges().has(tripRequest.college)) {
        throw new Error(`College ${tripRequest.college} does not exist`);
    }

    const query: db.CreateTripQuery = {
        ownerEmail: authToken.email,
        maxOtherMembers: tripRequest.maxOtherMembers,
        tripDate: tripRequest.tripDate,
        tripHour: tripRequest.tripHour,
        tripQuarterHour: tripRequest.tripQuarterHour,
        tripName: tripRequest.tripName,
        college: tripRequest.college,
        airport: tripRequest.airport
    };
    const createdTripResult: DatabaseResult<ITrip> = await cont(query);
    return await createdTripResult.caseOf({
        left: async (err: db.DatabaseErrorMessage) => {
            badRequest(res, 'could not save trip');
            throw new Error('could not save trip');
        },
        right: async (trip: models.ITripModel) => {
            return trip;
        }
    });
}

export async function handleFromCampusCreate(req: express.Request, res: express.Response, authToken: AuthToken): Promise<void> {
    let createdTrip: models.ITripModel;
    try {
        createdTrip = await handleTripCreate(req, res, authToken, db.createTripFromCampus);
    } catch (e) {
        log.ERROR('exception while creating trip from campus', e.message);
        badRequest(res, 'failed to create trip');
        return;
    }

    try {
        await db.addNewTripFromCampusToUser(createdTrip._id, authToken.email);
    } catch (e) {
        log.ERROR('Problem saving to user:', e.message);
        internalError(res, 'problem saving to user');
        return;
    }
    jsonResponse(res, createdTrip);
}

export async function handleFromAirportCreate(req: express.Request, res: express.Response, authToken: AuthToken): Promise<void> {
    let createdTrip: models.ITripModel;
    try {
        createdTrip = await handleTripCreate(req, res, authToken, db.createTripFromAirport);
    } catch (e) {
        log.ERROR('exception while creating trip from airport', e.message);
        badRequest(res, 'failed to create trip');
        return;
    }

    try {
        await db.addNewTripFromAirportToUser(createdTrip._id, authToken.email);
    } catch (e) {
        log.ERROR('Problem saving to user:', e.message);
        internalError(res, 'problem saving to user');
        return;
    }
    jsonResponse(res, createdTrip);
}

export async function handleJoinTripFromCampus(req: express.Request,
                                               res: express.Response,
                                               authToken: AuthToken
                                              ): Promise<void> {
    await handleJoinTrip(req, res, authToken, db.AddToCampusOrAirport.FROM_CAMPUS);
}

export async function handleJoinTripFromAirport(req: express.Request,
                                                res: express.Response,
                                                authToken: AuthToken
                                               ): Promise<void> {
    await handleJoinTrip(req, res, authToken, db.AddToCampusOrAirport.FROM_AIRPORT);
}

export async function handleSearch(req: express.Request,
                                   res: express.Response,
                                   authToken: AuthToken,
                                   tripType: db.AddToCampusOrAirport
                                  ): Promise<void> {
    if (!req.body) {
        badRequest(res, 'missing request body');
        return;
    }

    const body: any = req.body;
    if (!body.tripDate ||
            !body.tripHour ||
            !body.college ||
            !body.airport) {
        badRequest(res, 'missing fields');
        return;
    }

    const dbResults: DatabaseResult<models.ITripModel[]> = await db.searchTrips({
        tripDate: body.tripDate,
        tripHour: body.tripHour,
        college: body.college,
        airport: body.airport
    }, tripType);

    dbResults.caseOf({
        left: e => {
            log.DEBUG('db exception when searching for trips', e);
            jsonResponse(res, []);
        },
        right: results => jsonResponse(res, results.filter((res: models.ITripModel) => {
            return res.ownerEmail !== authToken.email;
        }))
    });
}

export async function handleDeleteTrip(req: express.Request,
                                res: express.Response,
                                authToken: AuthToken,
                                tripType: db.AddToCampusOrAirport
                               ): Promise<void> {
    let tripId: ObjectIdTs;
    try {
        tripId = mongoose.Types.ObjectId(req.params.tripId);
    } catch (e) {
        log.DEBUG('failed to convert to mongo object ID', req.params.tripId);
        badRequest(res, 'bad trip ID');
        return;
    }

    try {
        const successResult: DatabaseResult<boolean> = await db.deleteTrip(tripId, authToken.email, tripType);
        successResult.caseOf({
            left: e => {
                badRequest(res, 'could not delete trip');
            },
            right: success => {
                if (!success) {
                    internalError(res, 'could not delete trip');
                } else {
                    successResponse(res);
                }
            }
        });
    } catch (e) {
        log.ERROR('failed to delete trip', tripType, e.message);
        internalError(res, 'exception while deleting trip');
    }
}

async function handleJoinTrip(req: express.Request,
                              res: express.Response,
                              authToken: AuthToken,
                              tripType: db.AddToCampusOrAirport
                             ): Promise<void> {
    const obj: any = req.body;
    if (!obj || !obj.tripId) {
        badRequest(res, 'missing fields');
        return;
    }

    let tripId: ObjectIdTs;
    try {
        tripId = mongoose.Types.ObjectId(obj.tripId);
    } catch (e) {
        log.DEBUG('failed to convert to mongo object ID', obj.tripId);
        badRequest(res, 'bad trip ID');
        return;
    }

    try {
        const result: DatabaseResult<boolean> = await db.addUserToTrip(tripId, authToken.email, tripType);
        result.caseOf({
            left: e => {
                switch (e) {
                    case db.DatabaseErrorMessage.TRIP_FULL:
                        badRequest(res, 'trip full');
                        break;
                    case db.DatabaseErrorMessage.NOT_FOUND:
                        badRequest(res, 'unknown trip');
                        break;
                    default:
                        log.ERROR('considered internal error:', e);
                        internalError(res);
                        break;
                }
            },
            right: success => {
                if (success) {
                    successResponse(res);
                } else {
                    log.ERROR('unexpected error');
                    internalError(res);
                }
            }
        });
    } catch (e) {
        log.ERROR('exception saving user', e);
        internalError(res);
    }
}
