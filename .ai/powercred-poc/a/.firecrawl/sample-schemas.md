[Jump to Content](https://apidocs.powercred.io/reference/sample-schema-files#content)

[![PowerCred](https://files.readme.io/13f1989-image_5_1.svg)](https://apidocs.powercred.io/reference)

[Guides](https://apidocs.powercred.io/docs) [Recipes](https://apidocs.powercred.io/recipes) [API Reference](https://apidocs.powercred.io/reference)

v1.0

* * *

[Log In](https://apidocs.powercred.io/login?redirect_uri=/reference/sample-schema-files) [![PowerCred](https://files.readme.io/13f1989-image_5_1.svg)](https://apidocs.powercred.io/reference)

API Reference

[Log In](https://apidocs.powercred.io/login?redirect_uri=/reference/sample-schema-files)

v1.0 [Guides](https://apidocs.powercred.io/docs) [Recipes](https://apidocs.powercred.io/recipes) [API Reference](https://apidocs.powercred.io/reference)

Sample schema files

Search
`CTRL-K`

JUMP TO `CTRL-/`

## Authentication

- [Create Session ID](https://apidocs.powercred.io/reference/default)
  - [Get tokenpost](https://apidocs.powercred.io/reference/post_auth-token)

## Intelligent Document Parser

- [Introduction to IDP](https://apidocs.powercred.io/reference/introduction-to-idp)
- [Sample schema files](https://apidocs.powercred.io/reference/sample-schema-files)
- [Document Parsing API](https://apidocs.powercred.io/reference/method_read_post)
  - [Start Parsingpost](https://apidocs.powercred.io/reference/method_read_post)
  - [Get Document Dataget](https://apidocs.powercred.io/reference/method_get_get)

## Digital Insights API

- [Insights API](https://apidocs.powercred.io/reference/digitalinsightstelco)
  - [Digital insights information](https://apidocs.powercred.io/reference/digital-insights-data)
  - [Get Insightsget](https://apidocs.powercred.io/reference/method_telco_get)

## Identity Verification

- [/identity/get/ocr/ktp](https://apidocs.powercred.io/reference/method_get_ocr_ktp_post)
  - [Get KTP informationpost](https://apidocs.powercred.io/reference/method_get_ocr_ktp_post)
- [/identity/get/ocr/ktp/v2](https://apidocs.powercred.io/reference/method_get_ocr_ktp_v2_post)
  - [Get KTP informationpost](https://apidocs.powercred.io/reference/method_get_ocr_ktp_v2_post)
- [/identity/get/ocr/ktp/v3](https://apidocs.powercred.io/reference/identitygetocrktpv3)
  - [Get KTP informationpost](https://apidocs.powercred.io/reference/method_get_ocr_ktp_v3_post)
- [FaceMatch & Liveness](https://apidocs.powercred.io/reference/identitygetliveness-facematch)
  - [Face Comparison & Passive Livenesspost](https://apidocs.powercred.io/reference/method_liveness_facematch_post)

## Telco VERIFICATION

- [Introduction to Telco insights](https://apidocs.powercred.io/reference/telco-insights-api)
- [Telco Insights API](https://apidocs.powercred.io/reference/telco_information_insights_post)
  - [Start telco processingpost](https://apidocs.powercred.io/reference/telco_information_insights_post)
  - [Retrieve telco dataget](https://apidocs.powercred.io/reference/profile_data_profile_get)

## Bank Statement Analysis API

- [Introduction to business bank statement analysis](https://apidocs.powercred.io/reference/suported-banks-and-regions)
- [Upload bank statement(s) in PDF/JPG/PNG format](https://apidocs.powercred.io/reference/method_stmt_upload_img_post)
  - [Upload Bank statements in JPG/PNG formatpost](https://apidocs.powercred.io/reference/method_stmt_upload_img_post)
  - [Upload Bank statements in PDF format or process JPG/PNG formatpost](https://apidocs.powercred.io/reference/method_stmt_upload_post)
- [Start the bank statement analysis](https://apidocs.powercred.io/reference/method_stmt_publish_post)
  - [Start the bank statement analysis processpost](https://apidocs.powercred.io/reference/method_stmt_publish_post)
- [Get processing status](https://apidocs.powercred.io/reference/get_file_status_analysis_filestatus_get)
  - [Get the processing status of all the uploaded bank statement(s)get](https://apidocs.powercred.io/reference/get_file_status_analysis_filestatus_get)
- [Get analyzed statements output](https://apidocs.powercred.io/reference/get_transactions_details_transactions_fetch_get)
  - [Get bank statement account, transactions, credit, debit and overview outputs in json format.get](https://apidocs.powercred.io/reference/get_transactions_details_transactions_fetch_get)
  - [Get bank statement analysis and tamper checks outputs in json format.get](https://apidocs.powercred.io/reference/get_analysis_details_transactions_analysis_fetch_get)
  - [Get bank statement raw analysis output in excel format.get](https://apidocs.powercred.io/reference/get_bank_excels_analysis_statement_get)
  - [Get all the processed bank statements analyzed outputs in json format.get](https://apidocs.powercred.io/reference/get_bsa_output_analysis_profile_get)
- [Generate analysis and modules for individual banks](https://apidocs.powercred.io/reference/analysis_transactions_analysis_post)
  - [Generate raw analysis excel output for individual bankspost](https://apidocs.powercred.io/reference/analysis_transactions_analysis_post)
  - [Generate full modules excel output for individual bankspost](https://apidocs.powercred.io/reference/method_analysis_modules_post)
- [Bank transaction calculations](https://apidocs.powercred.io/reference/method_calculate_balances_post)
  - [Get top 5 debitors and creditorspost](https://apidocs.powercred.io/reference/method_calculate_balances_post)
  - [Filter transactions by type (credit or debit or both)post](https://apidocs.powercred.io/reference/method_transactions_credit_post)
  - [EOD Balances Calculatorpost](https://apidocs.powercred.io/reference/method_calculate_eod_balances_post)
  - [Fraud Indicatorspost](https://apidocs.powercred.io/reference/method_bank_analysis_fraud_post)

Powered by [ReadMe](https://readme.com/?ref_src=hub&project=powercred)

1. Intelligent Document Parser

# Sample schema files

Copy Page

Define your custom output format for supported documents using a schema YAML file. The document parser will generate output that exactly matches the structure specified in this schema file. Below are the supported data types and their appropriate usage scenarios:

Below is a table of the supported data types, their descriptions, and use cases in a more concise format:

| Datatype | Description | Use Case Example |
| --- | --- | --- |
| Object | Single occurrence fields. Outputs in JSON key-value pairs. | Unique invoice number in an invoice. |
| Array | Multiple occurrence fields. Outputs as an array of JSON key-value pairs. | List of products in an invoice. |
| String | Textual information at the field level. | Seller's or buyer's name in an invoice. |
| Float | Numeric information with decimal values at the field level. | Unit price of a product in an invoice. |
| Integer | Numeric information with whole numbers at the field level. | Quantity of a product bought in an invoice. |
| Date | Date information at the field level. Supports various formats for year, month, and day. | Invoice date or payment date in an invoice. |

* * *

**Listed below are sample schema used by default by our parsers. Please refer to these examples to create your own schema file.**

> 🚧
>
> ### Nested objects/arrays are not supported in the output schema   [Skip link to Nested objects/arrays are not supported in the output schema](https://apidocs.powercred.io/reference/sample-schema-files\#nested-objectsarrays-are-not-supported-in-the-output-schema)

### Invoice   [Skip link to Invoice](https://apidocs.powercred.io/reference/sample-schema-files\#invoice)

YAML

```yaml

document_type: invoice

schema:
  invoice_items:
    type: array
    items:
      type: object
      properties:
        - name: item_name
          type: string
        - name: item_description
          type: string
        - name: item_quantity
          type: float
        - name: unit_price
          type: float
        - name: total_price
          type: float
  invoice_information:
    type: object
    properties:
      - name: invoice_number
        type: string
      - name: supplier_name
        type: string
      - name: supplier_address
        type: string
      - name: receiver_name
        type: string
      - name: receiver_address
        type: string
      - name: supplier_email
        type: string
      - name: nett_value
        type: float
      - name: tax_amount
        type: float
      - name: gross_value
        type: float
      - name: balance_due
        type: float
      - name: delivery_charge_amount
        type: float
      - name: other_charge_amount
        type: float
      - name: invoice_currency
        type: string
      - name: invoice_delivery_date
        type: date
        format: "%Y-%m-%d"
      - name: payment_due_date
        type: date
        format: "%Y-%m-%d"
      - name: invoice_date
        type: date
        format: "%Y-%m-%d"
      - name: purchase_order_number
        type: string


```

### Bank Statement   [Skip link to Bank Statement](https://apidocs.powercred.io/reference/sample-schema-files\#bank-statement)

YAML

```yaml

document_type: bank_statement

schema:
  accounts:
    type: object
    properties:
      - name: account_holder_name
        type: string
      - name: account_number
        type: string
      - name: bank_address
        type: string
      - name: account_holder_address
        type: string
      - name: statement_start_period
        type: date
        format: "%B %Y"
      - name: statement_end_period
        type: date
        format: "%B %Y"

  transactions:
    type: array
    items:
      type: object
      properties:
        - name: date
          type: date
          format: "%Y-%m-%d"
        - name: description
          type: string
        - name: debit amount
          type: float
        - name: credit amount
          type: float
        - name: type (debit/credit)
          type: string
        - name: balance
          type: float
```

### Passport   [Skip link to Passport](https://apidocs.powercred.io/reference/sample-schema-files\#passport)

YAML

```yaml
document_type: passport

schema:
  passport:
    type: object
    properties:
      - name: passport_number
        type: string
      - name: passport_holder_name
        type: string
      - name: passport_holder_address
        type: string
      - name: passport_holder_gender(male/female)
        type: string
      - name: passport_holder_date_of_birth
        type: date
        format: '%Y-%m-%d'
      - name: passport_issuing_country
        type: string
      - name: passport_issuance_date
        type: date
        format: '%Y-%m-%d'
      - name: passport_expiration_date
        type: date
        format: '%Y-%m-%d'
```

### Payslip   [Skip link to Payslip](https://apidocs.powercred.io/reference/sample-schema-files\#payslip)

YAML

```yaml

document_type: payslip

schema:
  payslip:
    type: object
    properties:
      - name: employer_name
        type: string
      - name: employee_name
        type: string
      - name: gross_salary
        type: float
      - name: net_salary
        type: float
      - name: allowances
        type: float
      - name: deductions
        type: float
      - name: deduction_description
        type: string
      - name: year_to_date_salary
        type: float
      - name: payslip_month
        type: date
        format: "%B %Y"
      - name: credit_bank_name
        type: string
      - name: credit_bank_account_number
        type: string
      - name: hr_email_information
        type: string
      - name: country_of_employment
        type: string
      - name: currency_of_payslip
        type: string
      - name: language_of_payslip
        type: string
```

### Certificate of Employment   [Skip link to Certificate of Employment](https://apidocs.powercred.io/reference/sample-schema-files\#certificate-of-employment)

```undefined
document_type: employment_certificate

schema:
  employment_information:
    type: object
    properties:
      - name: employer_name
        type: string
      - name: employer_address
        type: string
      - name: employee_name
        type: string
      - name: employee_id
        type: string
      - name: employment_start_date
        type: string
      - name: employment_start_date_formatted
        type: date
        format: "%Y-%m-%d"
      - name: employment_end_date
        type: string
      - name: employee_designation
        type: string
      - name: hr_name
        type: string
      - name: hr_contact
        type: string
      - name: compensation
        type: float
      - name: compensation_frequency (weekly, biweekly, monthly etc)
        type: string
      - name: total_allowances_amount
        type: float
      - name: allowances_description
        type: string
      - name: total_bonuses_amount
        type: float
      - name: work_responsibilities
        type: string
      - name: certificate_requested_by
        type: string
      - name: certificate_issued_for
        type: string
      - name: country_of_employment
        type: string
      - name: currency_of_compensation
        type: string
      - name: document_issue_date_original
        type: string
      - name: document_issue_date_formatted
        type: "%Y-%m-%d"
```

### ITR Information   [Skip link to ITR Information](https://apidocs.powercred.io/reference/sample-schema-files\#itr-information)

YAML

```yaml
document_type: itr

schema:
  itr:
    type: object
    properties:
      - name: tax_identification_number(TIN)
        type: string
      - name: name
        type: string
      - name: employer_name
        type: string
      - name: employer_address
        type: string
      - name: signatory
        type: string
      - name: signatory_designation
        type: string
      - name: gross_compensation
        type: float
      - name: total_taxable_income
        type: float
```

### Utility Bills   [Skip link to Utility Bills](https://apidocs.powercred.io/reference/sample-schema-files\#utility-bills)

YAML

```yaml
document_type: utility_bills

schema:
  utility_bill:
    type: object
    properties:
      - name: statement_date
        type: date
        format: "%Y-%m-%d"
      - name: name
        type: string
      - name: coverage
        type: string
      - name: due_date
        type: date
        format: "%Y-%m-%d"
      - name: previous_balance
        type: float
      - name: previous_payment
        type: float
      - name: current_balance
        type: float
      - name: please_pay_identifier
        type: string
```

### Credit Card Statements   [Skip link to Credit Card Statements](https://apidocs.powercred.io/reference/sample-schema-files\#credit-card-statements)

YAML

```yaml

document_type: credit_card_statement

schema:
  accounts:
    type: object
    properties:
      - name: account_holder_name
        type: string
      - name: account_number
        type: string
      - name: bank_address
        type: string
      - name: account_holder_address
        type: string
      - name: statement_start_period
        type: date
        format: "%B %Y"
      - name: statement_end_period
        type: date
        format: "%B %Y"

  transactions:
    type: array
    items:
      type: object
      properties:
        - name: date
          type: date
          format: "%Y-%m-%d"
        - name: description
          type: string
        - name: debit amount
          type: float
        - name: credit amount
          type: float
        - name: type (debit/credit)
          type: string
        - name: balance
          type: float
```

### Loan Statement   [Skip link to Loan Statement](https://apidocs.powercred.io/reference/sample-schema-files\#loan-statement)

YAML

```yaml

document_type: loan_statement

schema:
  accounts:
    type: object
    properties:
      - name: account_holder_name
        type: string
      - name: account_number
        type: string
      - name: bank_address
        type: string
      - name: account_holder_address
        type: string
      - name: bank_name
        type: string
      - name: loan_amount
        type: float
      - name: outstanding_loan_amount
        type: float
      - name: monthly_installments
        type: float
      - name: tenure_paid(number of months)
        type: integer
      - name: tenure_pending(number of months)
        type: integer
      - name: Please pay by date
        type: date
        format: '%Y-%m-%d'

  transactions:
    type: array
    items:
      type: object
      properties:
        - name: date
          type: date
          format: "%Y-%m-%d"
        - name: description
          type: string
        - name: amount
          type: float
        - name: type (debit/credit)
          type: string
        - name: balance
          type: float
```

Updated 12 months ago

* * *

[Introduction to IDP](https://apidocs.powercred.io/reference/introduction-to-idp) [Document Parsing API](https://apidocs.powercred.io/reference/idpread)

Did this page help you?

Yes

No

Updated12 months ago

* * *

[Introduction to IDP](https://apidocs.powercred.io/reference/introduction-to-idp) [Document Parsing API](https://apidocs.powercred.io/reference/idpread)

Did this page help you?

Yes

No

- [Invoice](https://apidocs.powercred.io/reference/sample-schema-files#invoice)
- [Bank Statement](https://apidocs.powercred.io/reference/sample-schema-files#bank-statement)
- [Passport](https://apidocs.powercred.io/reference/sample-schema-files#passport)
- [Payslip](https://apidocs.powercred.io/reference/sample-schema-files#payslip)
- [Certificate of Employment](https://apidocs.powercred.io/reference/sample-schema-files#certificate-of-employment)
- [ITR Information](https://apidocs.powercred.io/reference/sample-schema-files#itr-information)
- [Utility Bills](https://apidocs.powercred.io/reference/sample-schema-files#utility-bills)
- [Credit Card Statements](https://apidocs.powercred.io/reference/sample-schema-files#credit-card-statements)
- [Loan Statement](https://apidocs.powercred.io/reference/sample-schema-files#loan-statement)

1. Authentication
2. [Create Session ID](https://apidocs.powercred.io/reference/default)
3. [Get tokenpost](https://apidocs.powercred.io/reference/post_auth-token)

1. Intelligent Document Parser
2. [Introduction to IDP](https://apidocs.powercred.io/reference/introduction-to-idp)
3. [Sample schema files](https://apidocs.powercred.io/reference/sample-schema-files)
4. [Document Parsing API](https://apidocs.powercred.io/reference/idpread)
5. [Get Document Dataget](https://apidocs.powercred.io/reference/method_get_get)
6. [Start Parsingpost](https://apidocs.powercred.io/reference/method_read_post)

1. Digital Insights API
2. [Insights API](https://apidocs.powercred.io/reference/digitalinsightstelco)
3. [Get Insightsget](https://apidocs.powercred.io/reference/method_telco_get)
4. [Digital insights information](https://apidocs.powercred.io/reference/digital-insights-data)

1. Identity Verification
2. [/identity/get/ocr/ktp](https://apidocs.powercred.io/reference/identitygetocrktp)
3. [Get KTP informationpost](https://apidocs.powercred.io/reference/method_get_ocr_ktp_post)
4. [/identity/get/ocr/ktp/v2](https://apidocs.powercred.io/reference/identitygetocrktpv2)
5. [Get KTP informationpost](https://apidocs.powercred.io/reference/method_get_ocr_ktp_v2_post)
6. [/identity/get/ocr/ktp/v3](https://apidocs.powercred.io/reference/identitygetocrktpv3)
7. [Get KTP informationpost](https://apidocs.powercred.io/reference/method_get_ocr_ktp_v3_post)
8. [FaceMatch & Liveness](https://apidocs.powercred.io/reference/identitygetliveness-facematch)
9. [Face Comparison & Passive Livenesspost](https://apidocs.powercred.io/reference/method_liveness_facematch_post)

1. Telco VERIFICATION
2. [Introduction to Telco insights](https://apidocs.powercred.io/reference/telco-insights-api)
3. [Telco Insights API](https://apidocs.powercred.io/reference/telcoinsights)
4. [Retrieve telco dataget](https://apidocs.powercred.io/reference/profile_data_profile_get)
5. [Start telco processingpost](https://apidocs.powercred.io/reference/telco_information_insights_post)

01. Bank Statement Analysis API
02. [Introduction to business bank statement analysis](https://apidocs.powercred.io/reference/suported-banks-and-regions)
03. [Upload bank statement(s) in PDF/JPG/PNG format](https://apidocs.powercred.io/reference/upload-bank-statements-in-pdfjpgpng-format)
04. [Upload Bank statements in PDF format or process JPG/PNG formatpost](https://apidocs.powercred.io/reference/method_stmt_upload_post)
05. [Upload Bank statements in JPG/PNG formatpost](https://apidocs.powercred.io/reference/method_stmt_upload_img_post)
06. [Start the bank statement analysis](https://apidocs.powercred.io/reference/start-the-bank-statement-analysis)
07. [Start the bank statement analysis processpost](https://apidocs.powercred.io/reference/method_stmt_publish_post)
08. [Get processing status](https://apidocs.powercred.io/reference/get-processing-status)
09. [Get the processing status of all the uploaded bank statement(s)get](https://apidocs.powercred.io/reference/get_file_status_analysis_filestatus_get)
10. [Get analyzed statements output](https://apidocs.powercred.io/reference/get-analyzed-statements-output)
11. [Get all the processed bank statements analyzed outputs in json format.get](https://apidocs.powercred.io/reference/get_bsa_output_analysis_profile_get)
12. [Get bank statement raw analysis output in excel format.get](https://apidocs.powercred.io/reference/get_bank_excels_analysis_statement_get)
13. [Get bank statement analysis and tamper checks outputs in json format.get](https://apidocs.powercred.io/reference/get_analysis_details_transactions_analysis_fetch_get)
14. [Get bank statement account, transactions, credit, debit and overview outputs in json format.get](https://apidocs.powercred.io/reference/get_transactions_details_transactions_fetch_get)
15. [Generate analysis and modules for individual banks](https://apidocs.powercred.io/reference/generate-analysis-and-modules-for-individual-banks)
16. [Generate full modules excel output for individual bankspost](https://apidocs.powercred.io/reference/method_analysis_modules_post)
17. [Generate raw analysis excel output for individual bankspost](https://apidocs.powercred.io/reference/analysis_transactions_analysis_post)
18. [Bank transaction calculations](https://apidocs.powercred.io/reference/bank-transaction-calculations)
19. [Fraud Indicatorspost](https://apidocs.powercred.io/reference/method_bank_analysis_fraud_post)
20. [EOD Balances Calculatorpost](https://apidocs.powercred.io/reference/method_calculate_eod_balances_post)
21. [Filter transactions by type (credit or debit or both)post](https://apidocs.powercred.io/reference/method_transactions_credit_post)
22. [Get top 5 debitors and creditorspost](https://apidocs.powercred.io/reference/method_calculate_balances_post)