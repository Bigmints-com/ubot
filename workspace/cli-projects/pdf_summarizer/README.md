# PDF Summarizer

This command-line tool summarizes the content of a PDF file using a Hugging Face transformer model.

## Prerequisites

- Python 3.6+
- A Hugging Face API key

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/pdf-summarizer.git
    cd pdf-summarizer
    ```

2.  **Create and activate a virtual environment:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Install the dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Set the Hugging Face API key:**
    You need to set your Hugging Face API key as an environment variable named `HUGGING_FACE_HUB_TOKEN`.

    -   **Linux/macOS:**
        ```bash
        export HUGGING_FACE_HUB_TOKEN="your-api-key"
        ```

    -   **Windows:**
        ```bash
        set HUGGING_FACE_HUB_TOKEN="your-api-key"
        ```
    > **Note:** Replace `"your-api-key"` with your actual Hugging Face API key.

## Usage

To summarize a PDF file, run the `summarizer.py` script with the path to your PDF file as an argument:

```bash
python summarizer.py /path/to/your/document.pdf
```

### Example

```bash
python summarizer.py sample.pdf
```

This will print the summary of the `sample.pdf` file to the console.
