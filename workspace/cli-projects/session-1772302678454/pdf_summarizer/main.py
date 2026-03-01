import argparse
import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import GoogleGenerativeAI
from langchain_classic.chains.summarize import load_summarize_chain


def summarize_pdf(pdf_file_path, api_key):
    """
    Summarizes a PDF file using a large language model.

    Args:
        pdf_file_path (str): The path to the PDF file.
        api_key (str): The API key for the language model.
    """

    # Load the PDF
    loader = PyPDFLoader(pdf_file_path)
    documents = loader.load()

    # Split the text into chunks
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=0)
    texts = text_splitter.split_documents(documents)

    # Create the LLM
    llm = GoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=api_key)

    # Create the prompt
    prompt_template = """Write a concise summary of the following:
    "{text}"
    CONCISE SUMMARY:"""
    prompt = PromptTemplate.from_template(prompt_template)

    # Create the summarization chain
    chain = load_summarize_chain(llm, chain_type="stuff", prompt=prompt)

    # Run the chain
    summary = chain.invoke(texts)

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Summarize a PDF file.")
    parser.add_argument("pdf_file", help="The path to the PDF file.")
    args = parser.parse_args()

    # Get the API key from the environment
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY environment variable not set. Please set it to your API key.")
    else:
        summary = summarize_pdf(args.pdf_file, api_key)
        print(summary["output_text"])
