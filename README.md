# Desktop table and inline-preview sizing evidence

Synthetic reproduction fixtures, captured in a downstream Hermes Desktop build on 2026-10-27.
The affected upstream components were unchanged from v0.22.5 through upstream main 19949783b2.
Before: stock component behavior. After: the proposed CSS/size rules injected during research,
subsequently reverified in the implemented downstream build and with upstream-source regressions.
These are cropped content images, not full application windows. All widget business metrics are fictional.

Table: 900px window, 584px transcript column; first column 62px before and 173px after.
Wide widget: 836x244 content in a 640x265 frame before, 836x244 after.
Fluid widget: 41px content in a 640x280 frame before, follows the column with 41px height after.

The two HTML files reproduce the widget screenshots via ::preview{file="..."}.
