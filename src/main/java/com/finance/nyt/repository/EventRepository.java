package com.finance.nyt.repository;
import java.util.UUID;
import com.finance.nyt.model.LoanEvent;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
public interface EventRepository extends JpaRepository<LoanEvent, Long> {
    Page<LoanEvent> findByApplicationId(UUID applicationId, Pageable pageable);
}

