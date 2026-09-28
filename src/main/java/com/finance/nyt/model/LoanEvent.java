package com.finance.nyt.model;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
import com.finance.nyt.security.EncryptedStringConverter;

@Entity
@Table(name = "loan_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoanEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false) private UUID applicationId;
    @Column(nullable = false, length = 200) private String actorId;
    @Column(nullable = false, length = 64) private String action;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private LoanStatus status;
    @Convert(converter = EncryptedStringConverter.class) @Column(columnDefinition = "text") private String note;
    @Column(nullable = false) private Instant occurredAt;

    public LoanEvent(UUID applicationId, String actorId, String action, LoanStatus status, String note, Instant now) {
        this.applicationId = applicationId; this.actorId = actorId; this.action = action; this.status = status;
        this.note = note; occurredAt = now;
    }
}

