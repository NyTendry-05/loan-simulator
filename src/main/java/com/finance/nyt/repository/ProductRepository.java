package com.finance.nyt.repository;
import java.util.UUID;
import com.finance.nyt.model.LoanProduct;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ProductRepository extends JpaRepository<LoanProduct, UUID> {
    Page<LoanProduct> findByActiveTrue(Pageable pageable);
}

