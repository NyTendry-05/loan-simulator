package com.finance.nyt.repository;
import com.finance.nyt.model.PortalSession;
import org.springframework.data.jpa.repository.*;
public interface SessionRepository extends JpaRepository<PortalSession, String> {
    @EntityGraph(attributePaths = "user")
    java.util.Optional<PortalSession> findByTokenHash(String tokenHash);
    @Modifying @Query("delete from PortalSession s where s.expiresAt < :now")
    int deleteExpired(java.time.Instant now);
}

