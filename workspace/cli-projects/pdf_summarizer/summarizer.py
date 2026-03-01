import argparse
import os
import PyPDF2
from transformers import pipeline

def get_api_key():
    """Gets the Hugging Face API key from an environment variable."""
    api_key = os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if not api_key:
        print("Error: HUGGING_FACE_HUB_TOKEN environment variable not set.")
        print("Please set the environment variable with your Hugging Face API key.")
        return None
    return api_key

def extract_text_from_pdf(pdf_path):
    """Extracts text from a PDF file."""
    try:
        with open(pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            text = ""
            for page in reader.pages:
                text += page.extract_text()
        return text
    except FileNotFoundError:
        return "Error: The specified PDF file was not found."
    except Exception as e:
        return f"Error extracting text: {e}"

def summarize_text(text, api_key):
    """Summarizes text using a transformer model."""
    try:
        summarizer = pipeline("summarization", model="facebook/bart-large-cnn", token=api_key)
        summary = summarizer(text, max_length=150, min_length=30, do_sample=False)
        return summary[0]['summary_text']
    except Exception as e:
        return f"Error summarizing text: {e}"

def main():
    """Main function to parse arguments and run the summarizer."""
    parser = argparse.ArgumentParser(description="Summarize a PDF file.")
    parser.add_argument("pdf_path", help="The path to the PDF file.")
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        return

    print("Extracting text from PDF...")
    text = extract_text_from_pdf(args.pdf_path)

    if text.startswith("Error"):
        print(text)
        return

    print("Summarizing text...")
    summary = summarize_text(text, api_key)

    if summary.startswith("Error"):
        print(summary)
        return

    print("\nSummary:")
    print(summary)

if __name__ == "__main__":
    main()
