[Jump to Content](https://apidocs.powercred.io/reference/suported-banks-and-regions#content)

[![PowerCred](https://files.readme.io/13f1989-image_5_1.svg)](https://apidocs.powercred.io/reference)

[Guides](https://apidocs.powercred.io/docs) [Recipes](https://apidocs.powercred.io/recipes) [API Reference](https://apidocs.powercred.io/reference)

v1.0

* * *

[Log In](https://apidocs.powercred.io/login?redirect_uri=/reference/suported-banks-and-regions) [![PowerCred](https://files.readme.io/13f1989-image_5_1.svg)](https://apidocs.powercred.io/reference)

API Reference

[Log In](https://apidocs.powercred.io/login?redirect_uri=/reference/suported-banks-and-regions)

v1.0 [Guides](https://apidocs.powercred.io/docs) [Recipes](https://apidocs.powercred.io/recipes) [API Reference](https://apidocs.powercred.io/reference)

Introduction to business bank statement analysis

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

1. Bank Statement Analysis API

# Introduction to business bank statement analysis

Copy Page

### Overview   [Skip link to Overview](https://apidocs.powercred.io/reference/suported-banks-and-regions\#overview)

Our bank statement analyzer is specifically designed to cater to the unique needs of small businesses and financial institutions serving this segment. This highly effective tool is invaluable for those looking to gain deeper insights into business financial activities through bank statements analysis. With its specialized modules, our analyzer provides comprehensive support for financial management and decision-making processes.

1. **Snapshot Analysis:** This feature offers a comprehensive overview of your financial statements, providing crucial insights such as total cash inflows and outflows, bounced cheque instances, and the opening and closing balances for each month. It's designed to give you a quick yet detailed look at your financial activity over time.

2. **Document Authenticity Verification:** In an era where document fraud is on the rise, distinguishing genuine documents from forgeries is essential. Our tool conducts a detailed forensic examination of financial statements, analyzing metadata like PDF creation software and document timestamps, as well as ensuring uniformity in font size, color, and typeface throughout the document to ascertain its authenticity.

3. **Interactive Financial Worksheets:** Tailored for dynamic financial analysis, these Excel-based worksheets facilitate the monitoring of transactions for specific beneficiaries. By simply entering a beneficiary's name, users can obtain a monthly summary of credit and debit transactions. These worksheets support various financial management tasks, including segregating personal and business finances, identifying major customer contributions, and tracking average monthly operating costs.

4. **End-of-Day Balance Tracker:** This utility provides detailed end-of-day balance summaries for individual or multiple accounts over selected periods. It also highlights the top five incoming (creditor) and outgoing (debtor) financial interactions, offering a clear perspective on your account's liquidity and major transaction partners.


* * *

### Supported banks, document formats and regions   [Skip link to Supported banks, document formats and regions](https://apidocs.powercred.io/reference/suported-banks-and-regions\#supported-banks-document-formats-and-regions)

We support the following regions and banks for bank statement analysis of businesses:

#### Indonesia   [Skip link to Indonesia](https://apidocs.powercred.io/reference/suported-banks-and-regions\#indonesia)

| Bank | JPG/PNG/JPEG | PDF |
| --- | --- | --- |
| BCA | ✅ | ✅ |
| Mandiri | ✅ | ✅ |
| BNI | ✅ | ✅ |
| BRI | ✅ | ✅ |
| OCBC | ✅ | ✅ |
| CIMB | ✅ | ✅ |
| Permata | ✅ | ✅ |

* * *

#### Malaysia   [Skip link to Malaysia](https://apidocs.powercred.io/reference/suported-banks-and-regions\#malaysia)

| Bank | JPG/PNG/JPEG | PDF |
| --- | --- | --- |
| Maybank | ✅ | ✅ |
| Maybank Islamic | ✅ | ✅ |
| CIMB | ✅ | ✅ |
| CIMB Islamic | ✅ | ✅ |
| RHB | ✅ | ✅ |
| RHB Islamic | ✅ | ✅ |

Updated 12 months ago

* * *

[Retrieve telco data](https://apidocs.powercred.io/reference/profile_data_profile_get) [Upload bank statement(s) in PDF/JPG/PNG format](https://apidocs.powercred.io/reference/upload-bank-statements-in-pdfjpgpng-format)

Did this page help you?

Yes

No

Updated12 months ago

* * *

[Retrieve telco data](https://apidocs.powercred.io/reference/profile_data_profile_get) [Upload bank statement(s) in PDF/JPG/PNG format](https://apidocs.powercred.io/reference/upload-bank-statements-in-pdfjpgpng-format)

Did this page help you?

Yes

No

- [Overview](https://apidocs.powercred.io/reference/suported-banks-and-regions#overview)
- [Supported banks, document formats and regions](https://apidocs.powercred.io/reference/suported-banks-and-regions#supported-banks-document-formats-and-regions)
  - [Indonesia](https://apidocs.powercred.io/reference/suported-banks-and-regions#indonesia)
  - [Malaysia](https://apidocs.powercred.io/reference/suported-banks-and-regions#malaysia)

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