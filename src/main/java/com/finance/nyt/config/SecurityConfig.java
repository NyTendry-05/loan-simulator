package com.finance.nyt.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.beans.factory.ObjectProvider;
import com.finance.nyt.security.DatabaseTokenIntrospector;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    @Bean
    SecurityFilterChain security(HttpSecurity http, @Value("${app.security.roles-claim}") String rolesClaim,
        @Value("${app.auth.mode:oidc}") String mode, ObjectProvider<DatabaseTokenIntrospector> introspector) throws Exception {
        var roles = new JwtGrantedAuthoritiesConverter();
        roles.setAuthoritiesClaimName(rolesClaim);
        roles.setAuthorityPrefix("ROLE_");
        var converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(roles);
        return http.csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> {
                a.requestMatchers("/health").permitAll();
                if (mode.equals("local")) a.requestMatchers("/api/v1/auth/login", "/api/v1/auth/register").permitAll();
                a.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").hasRole("ADMIN").anyRequest().authenticated();
            })
            .oauth2ResourceServer(o -> {
                if (mode.equals("local")) o.opaqueToken(t -> t.introspector(introspector.getObject()));
                else o.jwt(j -> j.jwtAuthenticationConverter(converter));
            })
            .build();
    }
}
