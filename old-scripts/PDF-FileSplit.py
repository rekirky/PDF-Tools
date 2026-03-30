# Split PDF file into single pages
# Creates a folder next to the file with each individual page

## Modules
import PyPDF2
import os
from tkinter import Tk
from tkinter.filedialog import askopenfilename

# Create a Tkinter root window (hidden)
root = Tk()
root.withdraw()

# Open the file dialog box
pdf_file_path = askopenfilename()
file_name = os.path.basename(pdf_file_path)
file_directory = os.path.dirname(pdf_file_path)
folder = file_name[:-4]
#Create a folder to store the split files into
os.makedirs(f"{file_directory}/{folder}", exist_ok=True)

def split_pdf(file_path):
    pdf = PyPDF2.PdfReader(file_path)

    for page_number in range(len(pdf.pages)):
        output = PyPDF2.PdfWriter()
        output.add_page(pdf.pages[page_number])

        output_file_name = f"{file_directory}/{folder}/{file_name} ({page_number + 1}).pdf"
        with open(output_file_name, "wb") as output_file:
            output.write(output_file)
        print(f"Page {page_number + 1} extracted and saved as {output_file_name}")

split_pdf(pdf_file_path)
