import fitz  # PyMuPDF
import os
from tkinter.filedialog import askopenfilename

def extract_pdf_layers(input_pdf_path, output_folder):
    """
    Extracts each layer of a PDF and saves them as separate PDF files.

    :param input_pdf_path: Path to the input PDF file.
    :param output_folder: Folder to save the separate PDF layers.
    """
    # Open the PDF file
    pdf_document = fitz.open(input_pdf_path)

    # Get the number of pages in the PDF
    total_pages = pdf_document.page_count

    print(f"The PDF contains {total_pages} pages. Checking for layers...")

    # Iterate through pages to check for layer information
    for page_num in range(total_pages):
        page = pdf_document[page_num]

        # Extract the optional content (layers) from the page
        layers = page.get_oc()
        if not layers:
            print(f"No layers found on page {page_num + 1}.")
            continue

        print(f"Found {len(layers)} layers on page {page_num + 1}.")

        # Process and save each layer
        for layer_index, layer in enumerate(layers):
            layer_name = layer["name"]
            print(f"Processing layer: {layer_name}")

            # Enable only the current layer
            for l in layers:
                l["state"] = l == layer

            # Apply the layer state
            pdf_document.set_oc(layers)

            # Save the PDF with the current layer
            layer_pdf_path = os.path.join(output_folder, f"page_{page_num + 1}_layer_{layer_index + 1}_{layer_name}.pdf")
            pdf_document.save(layer_pdf_path)
            print(f"Layer saved as: {layer_pdf_path}")

    # Close the PDF document
    pdf_document.close()
    print("Processing complete.")


# Example usage
input_pdf_path = askopenfilename()   # Replace with your PDF file path
output_folder = "output_layers"  # Replace with your desired output folder

# Create output folder if it doesn't exist
os.makedirs(output_folder, exist_ok=True)

extract_pdf_layers(input_pdf_path, output_folder)
