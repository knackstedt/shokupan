import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { AuthService } from './auth.service';

describe('AuthService', () => {
    let service: AuthService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withFetch()),
                provideHttpClientTesting(),
                AuthService,
                { provide: MessageService, useValue: { add: jasmine.createSpy('add') } }
            ]
        });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('sets user to null when /auth/me returns 401', async () => {
        service = TestBed.inject(AuthService);
        const req = httpMock.expectOne('/auth/me');
        req.flush({ error: 'Unauthenticated' }, { status: 401, statusText: 'Unauthorized' });
        await Promise.resolve();
        expect(service.user()).toBeNull();
        expect(service.loading()).toBeFalse();
    });

    it('sets user when /auth/me returns 200', async () => {
        const mockUser = { id: '1', provider: 'github', name: 'Alice', permissions: ['dashboard:read'] };
        service = TestBed.inject(AuthService);
        const req = httpMock.expectOne('/auth/me');
        req.flush(mockUser);
        await Promise.resolve();
        expect(service.user()).toEqual(mockUser as any);
        expect(service.isAuthenticated).toBeTrue();
    });

    it('sets user to null when request errors', async () => {
        service = TestBed.inject(AuthService);
        const req = httpMock.expectOne('/auth/me');
        req.error(new ProgressEvent('Network Error'));
        await Promise.resolve();
        expect(service.user()).toBeNull();
    });

    it('login() redirects to OAuth endpoint', () => {
        service = TestBed.inject(AuthService);
        httpMock.expectOne('/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });

        spyOn(window, 'open');
        service.login('github');
        expect(window.open).toHaveBeenCalledWith('/auth/github/login', '_self');
    });

    it('logout() calls /auth/logout and clears user', async () => {
        service = TestBed.inject(AuthService);
        httpMock.expectOne('/auth/me').flush({ id: '1', provider: 'github' });
        await Promise.resolve();
        expect(service.user()).toBeTruthy();

        const logoutPromise = service.logout();
        const req = httpMock.expectOne('/auth/logout');
        req.flush({ ok: true });
        await logoutPromise;
        expect(service.user()).toBeNull();
    });
});
