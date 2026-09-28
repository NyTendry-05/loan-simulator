package com.finance.nyt.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.*;
import com.finance.nyt.model.PortalUser;

public final class AuthDtos {
    private AuthDtos() {}
    public record Register(@NotBlank @Email @Size(max = 254) String email,
                           @NotBlank @Size(max = 100) String name,
                           @NotBlank @Size(min = 12, max = 72) String password) {}
    public record Login(@NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 72) String password) {}
    public record Staff(@NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 100) String name,
                        @NotBlank @Size(min = 12, max = 72) String password,
                        @NotBlank @Pattern(regexp = "OFFICER|ADMIN") String role) {}
    public record User(UUID id, String email, String name, List<String> roles) {
        public static User from(PortalUser u) { return new User(u.getId(), u.getEmail(), u.getDisplayName(), List.of(u.getRole())); }
    }
    public record Session(String token, Instant expiresAt, User user) {}
}

