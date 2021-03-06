import * as React from 'react';
import { Component } from './Component';
import { Navbar, Nav, NavItem, NavDropdown, MenuItem, Button } from 'react-bootstrap';
import { ApplicationState } from '../index';
import { showOrHide, goToUrl } from '../utils/onClickUtils';
import { IGetBackStyles } from '../utils/style';
import { AuthState } from '../utils/authState';
import { browserHistory } from 'react-router';

export class MyNav extends Component<ApplicationState, {}> {
    constructor(props: ApplicationState) {
        super(props);
    }

    signOut() {
        const authState: AuthState = AuthState.getInstance();
        authState.deauthorize();
        browserHistory.push('/');
    }

    testFocus(event: any) {
        console.log(event);
    }

    render() {
        return (
            <Navbar className="navbar navbar-default navbar-static-top" style={IGetBackStyles.navbarStyle.navbarGlobal}>
                <Navbar.Header>
                    <Navbar.Brand>
                        <a href='#' onClick={goToUrl('/')}>I Get Back</a>
                    </Navbar.Brand>
                    <Navbar.Toggle />
                </Navbar.Header>
                <Navbar.Collapse>
                    <Nav>
                        <NavItem className={showOrHide(this.props.signedIn)} eventKey={1} href='' onClick={goToUrl('/t')}>
                            Campus → Airport
                        </NavItem>
                        <NavItem className={showOrHide(this.props.signedIn)} eventKey={2} href=''>Airport → Campus</NavItem>
                    </Nav>
                    <Nav pullRight>
                        <NavItem className={showOrHide(this.props.signedIn)} eventKey={3} href='' onClick={goToUrl('/account')}>Account</NavItem>
                        <NavItem className={showOrHide(this.props.signedIn)} eventKey={3} href='' onClick={this.signOut}>Sign Out</NavItem>
                        <NavItem className={showOrHide(!this.props.signedIn)} eventKey={4} href='' onClick={goToUrl('/register')}>Register</NavItem>
                        <NavItem className={showOrHide(!this.props.signedIn)} eventKey={5} href='' onClick={goToUrl('/signIn')}>Sign In</NavItem>
                    </Nav>
                </Navbar.Collapse>
            </Navbar>
        );
    }
};
