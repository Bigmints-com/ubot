from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font("Arial", size=12)
pdf.cell(
    200,
    10,
    txt="This is a test PDF file.",
    ln=1,
    align="C",
)
pdf.cell(
    200,
    10,
    txt="It contains some text that will be summarized by the LLM.",
    ln=1,
    align="C",
)
pdf.cell(
    200,
    10,
    txt="The summarization should be concise and accurate.",
    ln=1,
    align="C",
)
pdf.cell(
    200,
    10,
    txt="This is just a simple test to ensure that the tool is working correctly.",
    ln=1,
    align="C",
)
pdf.cell(
    200,
    10,
    txt="The quick brown fox jumps over the lazy dog.",
    ln=1,
    align="C",
)
pdf.cell(
    200,
    10,
    txt="This is the end of the test file.",
    ln=1,
    align="C",
)
pdf.output("pdf_summarizer/sample.pdf")
