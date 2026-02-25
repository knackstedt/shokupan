import { TestBed, fakeAsync } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
    let service: AuthService;
    let fetchSpy: jasmine.Spy;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [AuthService] });

        // Mock global fetch before the service constructs (initUser is called in constructor)
        fetchSpy = spyOn(globalThis, 'fetch');
    });

    it('sets user to null when /auth/me returns 401', fakeAsync(async () => {
        fetchSpy.and.resolveTo(new Response('{"error":"Unauthenticated"}', { status: 401 }));
        service = TestBed.inject(AuthService);
        await service.initUser();
        expect(service.user()).toBeNull();
        expect(service.loading()).toBeFalse();
    }));

    it('sets user when /auth/me returns 200', fakeAsync(async () => {
        const mockUser = { id: '1', provider: 'github', name: 'Alice', permissions: ['dashboard:read'] };
        fetchSpy.and.resolveTo(new Response(JSON.stringify(mockUser), { status: 200 }));
        service = TestBed.inject(AuthService);
        await service.initUser();
        expect(service.user()).toEqual(mockUser as any);
        expect(service.isAuthenticated).toBeTrue();
    }));

    it('sets user to null when fetch throws', fakeAsync(async () => {
        fetchSpy.and.rejectWith(new Error('Network Error'));
        service = TestBed.inject(AuthService);
        await service.initUser();
        expect(service.user()).toBeNull();
    }));

    it('login() redirects to OAuth endpoint', () => {
        fetchSpy.and.resolveTo(new Response('{}', { status: 200 }));
        service = TestBed.inject(AuthService);
        const locationSpy = spyOnProperty(globalThis, 'location', 'get').and.returnValue({
            href: ''
        } as Location);
        let destination = '';
        Object.defineProperty(location, 'href', { set: (v: string) => { destination = v; }, configurable: true });
        service.login('github');
        expect(destination).toContain('/auth/github/login');
    });

    it('logout() calls /auth/logout and clears user', fakeAsync(async () => {
        // First init user
        fetchSpy.and.resolveTo(new Response(JSON.stringify({ id: '1', provider: 'github' }), { status: 200 }));
        service = TestBed.inject(AuthService);
        await service.initUser();
        expect(service.user()).toBeTruthy();

        // Now logout
        fetchSpy.and.resolveTo(new Response('{"ok":true}', { status: 200 }));
        await service.logout();
        expect(service.user()).toBeNull();
    }));
});
