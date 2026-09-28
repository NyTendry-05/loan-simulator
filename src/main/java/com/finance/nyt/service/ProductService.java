package com.finance.nyt.service;

import java.time.Clock;
import java.util.Currency;
import java.util.UUID;
import com.finance.nyt.dto.*;
import com.finance.nyt.exception.BusinessException;
import com.finance.nyt.model.LoanProduct;
import com.finance.nyt.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductService {
    private final ProductRepository products;
    private final Clock clock;

    public ApiViews.Product get(UUID id) {
        return ApiViews.Product.from(products.findById(id).orElseThrow(BusinessException::missing));
    }

    public ApiViews.Paged<ApiViews.Product> list(int page, int size) {
        return ApiViews.Paged.from(products.findByActiveTrue(PageRequest.of(page, size, Sort.by("code"))).map(ApiViews.Product::from));
    }

    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public ApiViews.Product create(ProductRequest request) {
        try { Currency.getInstance(request.currency()); }
        catch (IllegalArgumentException e) { throw BusinessException.invalid("Unknown ISO 4217 currency"); }
        if (request.minAmount().compareTo(request.maxAmount()) > 0 || request.minTermMonths() > request.maxTermMonths())
            throw BusinessException.invalid("Minimum values must not exceed maximum values");
        if (request.minAmount().stripTrailingZeros().scale() > request.currencyScale()
                || request.maxAmount().stripTrailingZeros().scale() > request.currencyScale())
            throw BusinessException.invalid("Amount limits exceed the configured currency precision");
        return ApiViews.Product.from(products.save(new LoanProduct(request, clock.instant())));
    }

    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public void deactivate(UUID id) { products.findById(id).orElseThrow(BusinessException::missing).deactivate(); }
}
