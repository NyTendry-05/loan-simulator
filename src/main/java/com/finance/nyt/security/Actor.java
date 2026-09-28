package com.finance.nyt.security;

import com.finance.nyt.exception.BusinessException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthentication;

public record Actor(String subject, boolean customer, boolean officer, boolean admin) {
    public static Actor from(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken || authentication instanceof BearerTokenAuthentication)
                || authentication.getName() == null || authentication.getName().isBlank() || authentication.getName().length() > 200) {
            throw BusinessException.forbidden("A valid subject is required");
        }
        var roles = authentication.getAuthorities().stream().map(Object::toString).toList();
        return new Actor(authentication.getName(), roles.contains("ROLE_CUSTOMER"),
                roles.contains("ROLE_OFFICER"), roles.contains("ROLE_ADMIN"));
    }
    public void requireCustomer() {
        if (!customer) throw BusinessException.forbidden("Customer role required");
    }
    public void requireOfficer() {
        if (!officer) throw BusinessException.forbidden("Officer role required");
    }
}
