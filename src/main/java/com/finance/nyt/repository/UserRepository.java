package com.finance.nyt.repository;
import java.util.*;
import com.finance.nyt.model.PortalUser;
import org.springframework.data.jpa.repository.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
public interface UserRepository extends JpaRepository<PortalUser, UUID> {
    Page<PortalUser> findByRoleIn(Collection<String> roles, Pageable pageable);
    Optional<PortalUser> findByEmailIndex(String emailIndex);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from PortalUser u where u.emailIndex = :emailIndex")
    Optional<PortalUser> lockByEmailIndex(String emailIndex);
}
