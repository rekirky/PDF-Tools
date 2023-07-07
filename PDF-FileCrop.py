#Working...
#Loads up a screen to select a file, crop using mouse click top left to bottom right
#Saves a PNG and then converts that to PDF
#Remove temporary files and original uncropped file
#Remains cropped PDF

import fitz
import os
#from tkinter import Tk
from tkinter.filedialog import askopenfilename
import cv2
import PyPDF2
from PIL import Image
import win32gui
import win32con
import win32api

# Load the PDF file
pdf_path = askopenfilename()
file_name = os.path.basename(pdf_path)
file_directory = os.path.dirname(pdf_path)
folder = file_name[:-4]

#pdf_path = 'path/to/input.pdf'
doc = fitz.open(pdf_path)

# Select the cropping area using mouse interaction
page_number = 0  # Specify the page number to crop (0 for the first page)
page = doc[page_number]

for i, page in enumerate(doc):
    pix = page.get_pixmap()
    image_path = f'page_{i+1}.png'  # Save each page as a separate image file
    pix.save(image_path)
    points = []
    image = cv2.imread(image_path)

# Mouse callback function
def mouse_callback(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        points.append((x, y))
        if len(points) == 2:
            # Perform cropping
            crop_image = image[points[0][1]:points[1][1], points[0][0]:points[1][0]]
            crop_file = f"{file_name}.png"
            cv2.imwrite(f"{file_directory}/{crop_file}",crop_image)
            cv2.destroyAllWindows()
            pdf = PyPDF2.PdfWriter()
            output = Image.open(f"{file_directory}/{crop_file}").convert('RGB')
            doc.close()    
            os.rename(pdf_path,f"{pdf_path}-crop")
            output.save(f"{file_directory}/{crop_file[:-8]}.pdf")
            os.remove(f"{file_directory}/{crop_file}")
            os.remove(f"{pdf_path}-crop")
            print(f"File cropped successfully")

cv2.namedWindow('Image')
cv2.setMouseCallback('Image', mouse_callback)
cv2.imshow('Image', image)
hwnd = win32gui.FindWindow(None,'Image')

win32gui.SetWindowPos(hwnd,win32con.HWND_TOPMOST,0,0,win32api.GetSystemMetrics(win32con.SM_CXSCREEN),win32api.GetSystemMetrics(win32con.SM_CYSCREEN), win32con.SWP_SHOWWINDOW)
cv2.waitKey(0)






