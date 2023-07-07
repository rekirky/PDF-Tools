# Split PDF file into single pages
# Creates a folder next to the file with each individual page

## Modules
import PyPDF2 
from PyPDF2 import PdfWriter
import os
from tkinter import Tk
from tkinter.filedialog import askopenfilename, askopenfilenames

# Create a Tkinter root window (hidden)
root = Tk()
root.withdraw()
merger = PdfWriter()

# Open the file dialog box
pdf_files = askopenfilenames()
file_name = os.path.basename(pdf_files[0])
file_directory = os.path.dirname(pdf_files[0])

# Merge the PDF files
def pdf_merger():
    for pdf_file in pdf_files:
        #Open each PDF file in read-binary mode
        with open(pdf_file, "rb") as file:
            # Add the PDF file to the merger object
            merger.append(file)
        #Remove file once processed
        os.remove(pdf_file)
    
    # Specify the output file path for the merged PDF
    output_file = f"{file_directory}/{file_name}"
    
    # Write the merged PDF to the output file
    with open(output_file, "wb") as file:
        merger.write(file)
    
    print("PDF files merged successfully.")

pdf_merger()