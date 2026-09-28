package com.finance.nyt.service;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.UUID;
import com.finance.nyt.dto.AuthDtos;
import com.finance.nyt.dto.ApiViews;
import com.finance.nyt.exception.BusinessException;
import com.finance.nyt.model.*;
import com.finance.nyt.repository.*;
import com.finance.nyt.security.LocalIdentity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import java.util.List;

@Service @ConditionalOnProperty(name = "app.auth.mode", havingValue = "local")
@Transactional(readOnly = true)
public class AuthService {
    private final UserRepository users;
    private final SessionRepository sessions;
    private final LocalIdentity identity;
    private final Clock clock;
    private final Duration sessionDuration, lockDuration;
    private final int maxFailures;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final String dummyHash = passwords.encode(UUID.randomUUID().toString());

    public AuthService(UserRepository users, SessionRepository sessions, LocalIdentity identity, Clock clock,
                       @Value("${app.auth.session-duration}") Duration sessionDuration,
                       @Value("${app.auth.max-failures}") int maxFailures,
                       @Value("${app.auth.lock-duration}") Duration lockDuration) {
        if (sessionDuration.isNegative() || sessionDuration.isZero() || lockDuration.isNegative()
                || lockDuration.isZero() || maxFailures < 1) throw new IllegalArgumentException("Invalid authentication limits");
        this.users = users; this.sessions = sessions; this.identity = identity; this.clock = clock;
        this.sessionDuration = sessionDuration; this.lockDuration = lockDuration; this.maxFailures = maxFailures;
    }
    @Transactional
    public AuthDtos.Session register(AuthDtos.Register request) {
        return session(create(request.email(), request.name(), request.password(), "CUSTOMER"));
    }
    // Failed attempts must commit even though the HTTP response is an authentication error.
    @Transactional(noRollbackFor = BusinessException.class)
    public AuthDtos.Session login(AuthDtos.Login request) {
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) throw unauthorized();
        var optional = users.lockByEmailIndex(identity.emailIndex(request.email()));
        if (optional.isEmpty()) { passwords.matches(request.password(), dummyHash); throw unauthorized(); }
        var user = optional.get();
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(clock.instant())) throw unauthorized();
        if (user.getLockedUntil() != null) user.clearFailures();
        if (!passwords.matches(request.password(), user.getPasswordHash())) {
            user.failedLogin(maxFailures, clock.instant().plus(lockDuration));
            throw unauthorized();
        }
        user.clearFailures();
        return session(user);
    }
    public AuthDtos.User me(String subject) {
        return AuthDtos.User.from(users.findById(UUID.fromString(subject)).orElseThrow(BusinessException::missing));
    }
    @PreAuthorize("hasRole('ADMIN')")
    public ApiViews.Paged<AuthDtos.User> staff(int page, int size) {
        return ApiViews.Paged.from(users.findByRoleIn(List.of("ADMIN", "OFFICER"),
            PageRequest.of(page, size, Sort.by("createdAt", "id"))).map(AuthDtos.User::from));
    }
    @Transactional
    public void logout(String token) { sessions.deleteById(identity.tokenHash(token)); }
    @Transactional @PreAuthorize("hasRole('ADMIN')")
    public AuthDtos.User createStaff(AuthDtos.Staff request) {
        return AuthDtos.User.from(create(request.email(), request.name(), request.password(), request.role()));
    }
    @Transactional
    public void bootstrap(String email, String name, String password) {
        if (users.findByEmailIndex(identity.emailIndex(email)).isEmpty()) create(email, name, password, "ADMIN");
    }
    private PortalUser create(String email, String name, String password, String role) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72 || password.length() < 12)
            throw BusinessException.invalid("Use a password of at least 12 characters and at most 72 UTF-8 bytes");
        if (users.findByEmailIndex(identity.emailIndex(email)).isPresent()) throw BusinessException.conflict("An account with this email already exists");
        return users.saveAndFlush(new PortalUser(identity.normalizeEmail(email), identity.emailIndex(email),
            name.trim(), passwords.encode(password), role, clock.instant()));
    }
    private AuthDtos.Session session(PortalUser user) {
        sessions.deleteExpired(clock.instant());
        String token = identity.newToken();
        Instant expires = clock.instant().plus(sessionDuration);
        sessions.save(new PortalSession(identity.tokenHash(token), user, expires));
        return new AuthDtos.Session(token, expires, AuthDtos.User.from(user));
    }
    private BusinessException unauthorized() {
        return new BusinessException(HttpStatus.UNAUTHORIZED, "Sign-in failed. Check your credentials or try again later.");
    }
}
