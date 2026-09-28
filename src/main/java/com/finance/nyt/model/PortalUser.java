package com.finance.nyt.model;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
import com.finance.nyt.security.EncryptedStringConverter;

@Entity @Table(name = "portal_users") @Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PortalUser {
    @Id private UUID id;
    @Convert(converter = EncryptedStringConverter.class) @Column(nullable = false, columnDefinition = "text") private String email;
    @Column(nullable = false, unique = true, length = 64) private String emailIndex;
    @Convert(converter = EncryptedStringConverter.class) @Column(nullable = false, columnDefinition = "text") private String displayName;
    @Column(nullable = false, length = 100) private String passwordHash;
    @Column(nullable = false, length = 20) private String role;
    @Column(nullable = false) private int failedAttempts;
    private Instant lockedUntil;
    @Column(nullable = false) private Instant createdAt;

    public PortalUser(String email, String emailIndex, String name, String hash, String role, Instant now) {
        id = UUID.randomUUID(); this.email = email; this.emailIndex = emailIndex; displayName = name;
        passwordHash = hash; this.role = role; createdAt = now;
    }
    public void failedLogin(int maximum, Instant until) {
        failedAttempts++;
        if (failedAttempts >= maximum) lockedUntil = until;
    }
    public void clearFailures() { failedAttempts = 0; lockedUntil = null; }
}

