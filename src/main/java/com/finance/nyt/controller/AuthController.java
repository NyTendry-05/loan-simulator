package com.finance.nyt.controller;

import com.finance.nyt.dto.AuthDtos;
import com.finance.nyt.service.AuthService;
import com.finance.nyt.security.Actor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.finance.nyt.dto.ApiViews;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController @RequiredArgsConstructor
@ConditionalOnProperty(name = "app.auth.mode", havingValue = "local")
public class AuthController {
    private final AuthService auth;
    @PostMapping("/api/v1/auth/register") @ResponseStatus(HttpStatus.CREATED)
    public AuthDtos.Session register(@Valid @RequestBody AuthDtos.Register request) { return auth.register(request); }
    @PostMapping("/api/v1/auth/login")
    public AuthDtos.Session login(@Valid @RequestBody AuthDtos.Login request) { return auth.login(request); }
    @GetMapping("/api/v1/auth/me")
    public AuthDtos.User me(Authentication authentication) { return auth.me(Actor.from(authentication).subject()); }
    @PostMapping("/api/v1/auth/logout") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) { auth.logout(authorization.substring(7)); }
    @PostMapping("/api/v1/admin/users") @ResponseStatus(HttpStatus.CREATED)
    public AuthDtos.User staff(@Valid @RequestBody AuthDtos.Staff request) { return auth.createStaff(request); }
    @GetMapping("/api/v1/admin/users")
    public ApiViews.Paged<AuthDtos.User> staff(@RequestParam(defaultValue = "0") @Min(0) int page,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) { return auth.staff(page, size); }
}
