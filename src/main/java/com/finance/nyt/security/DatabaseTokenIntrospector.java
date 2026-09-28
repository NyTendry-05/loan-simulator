package com.finance.nyt.security;

import java.time.Clock;
import java.util.*;
import com.finance.nyt.repository.SessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.server.resource.introspection.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component @RequiredArgsConstructor
@ConditionalOnProperty(name = "app.auth.mode", havingValue = "local")
public class DatabaseTokenIntrospector implements OpaqueTokenIntrospector {
    private final SessionRepository sessions;
    private final LocalIdentity identity;
    private final Clock clock;
    @Override @Transactional(readOnly = true)
    public OAuth2AuthenticatedPrincipal introspect(String token) {
        if (!token.matches("[A-Za-z0-9_-]{43}")) throw new BadOpaqueTokenException("Invalid session");
        var session = sessions.findByTokenHash(identity.tokenHash(token))
            .filter(s -> s.getExpiresAt().isAfter(clock.instant()))
            .orElseThrow(() -> new BadOpaqueTokenException("Session expired or revoked"));
        var user = session.getUser();
        return new DefaultOAuth2AuthenticatedPrincipal(user.getId().toString(),
            Map.of("sub", user.getId().toString()), List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole())));
    }
}

