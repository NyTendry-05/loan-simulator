package com.finance.nyt.model;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;

@Entity @Table(name = "portal_sessions") @Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PortalSession {
    @Id @Column(length = 64) private String tokenHash;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "user_id") private PortalUser user;
    @Column(nullable = false) private Instant expiresAt;
    public PortalSession(String tokenHash, PortalUser user, Instant expiresAt) {
        this.tokenHash = tokenHash; this.user = user; this.expiresAt = expiresAt;
    }
}

