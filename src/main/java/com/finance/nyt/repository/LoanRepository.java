package com.finance.nyt.repository;
import java.util.*;
import com.finance.nyt.model.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import jakarta.persistence.LockModeType;

public interface LoanRepository extends JpaRepository<LoanApplication, UUID> {
    @EntityGraph(attributePaths = "product")
    Optional<LoanApplication> findByApplicantIdAndIdempotencyKey(String applicantId, UUID key);
    @EntityGraph(attributePaths = "product")
    Page<LoanApplication> findByApplicantId(String applicantId, Pageable pageable);
    @EntityGraph(attributePaths = "product")
    Page<LoanApplication> findByStatus(LoanStatus status, Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from LoanApplication a where a.id = :id")
    Optional<LoanApplication> lockById(UUID id);
}

