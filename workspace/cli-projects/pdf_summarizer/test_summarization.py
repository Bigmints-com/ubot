from transformers import pipeline

def test_summarization():
    """Tests the summarization pipeline with a different model."""
    try:
        summarizer = pipeline("summarization", model="t5-small")
        text = "This is a long text that needs to be summarized. It has multiple sentences and is designed to test the summarization pipeline."
        summary = summarizer(text, max_length=50, min_length=10, do_sample=False)
        print("Summary:", summary[0]['summary_text'])
    except Exception as e:
        print(f"Error during summarization: {e}")

if __name__ == "__main__":
    test_summarization()
