from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph

def create_pdf(file_path, content):
    """Creates a PDF file with the given content."""
    c = canvas.Canvas(file_path, pagesize=letter)
    styles = getSampleStyleSheet()
    style = styles['Normal']
    width, height = letter

    # Title
    title_style = styles['h1']
    p_title = Paragraph("The Future of Artificial Intelligence", title_style)
    p_title.wrapOn(c, width - 100, height)
    p_title.drawOn(c, 50, height - 50)

    # Content
    p_content = Paragraph(content, style)
    p_content.wrapOn(c, width - 100, height - 100)
    p_content.drawOn(c, 50, height - 150)

    c.save()

if __name__ == '__main__':
    # A long text to be summarized
    long_text = """
    Artificial intelligence (AI) is rapidly changing the world as we know it.
    From self-driving cars to personalized medicine, AI is poised to revolutionize every industry.
    This document explores the future of AI, including its potential benefits and risks.
    We will discuss the latest advancements in machine learning, natural language processing, and computer vision.
    We will also examine the ethical implications of AI and the importance of responsible development.
    The goal of this document is to provide a comprehensive overview of the future of AI and its potential impact on society.
    AI is a powerful tool that can be used for good or for ill. It is up to us to ensure that it is used for the benefit of all humanity.
    The development of AI is a complex and multifaceted issue. There are many different opinions on the best way to proceed.
    Some people believe that AI should be developed as quickly as possible, while others believe that we should proceed with caution.
    There are valid arguments on both sides of the issue. The important thing is to have an open and honest discussion about the future of AI.
    """
    create_pdf("sample.pdf", long_text)
    with open("sample.txt", "w") as f:
        f.write(long_text)
    print("sample.pdf and sample.txt created successfully.")