# Rotate PDF files by 90 degrees clockwise or counterclockwise

## Modules
import PyPDF2
import os
from tkinter import Tk
from tkinter.filedialog import askopenfilename

# Create a Tkinter root window (hidden)
root = Tk()
root.withdraw()


def rotate_pdf(file_path,degrees):
    #Create a folder to store the split files into
    file_name = os.path.basename(file_path)
    file_directory = os.path.dirname(file_path)
        
    pdf = PyPDF2.PdfReader(file_path)
    pdf_writer = PyPDF2.PdfWriter()
    
    for page_num in range(len(pdf.pages)):
        page = pdf.pages[page_num]
        page.rotate(degrees)
        pdf_writer.add_page(page)
    
    output_file_name = f"{file_directory}/{file_name} rotate {degrees}.pdf"
    with open (output_file_name, "wb") as output_file:
        pdf_writer.write(output_file)
    
def menu():
    print("PDF Rotation")
    print("1 = Rotate 90 degrees clockwise")
    print("2 = Rotate 90 degrees counterclockwise")
    choice = input("Enter your choice: ")
       
    if choice == '1': 
        return 90 
    else:
        return 270

def main():    
    degrees = menu()
    # Open the file dialog box
    pdf_file_path = askopenfilename()
    rotate_pdf(pdf_file_path,degrees)

main()