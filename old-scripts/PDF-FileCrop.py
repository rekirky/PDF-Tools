import fitz
import os
from tkinter.filedialog import askopenfilename
import cv2  # pip install opencv-python
from PIL import Image
import win32gui
import win32con
import win32api

# Load the PDF file
pdf_path = askopenfilename()
file_name = os.path.basename(pdf_path)
file_directory = os.path.dirname(pdf_path)
doc = fitz.open(pdf_path)

# Convert first page to image
page = doc[0]
pix = page.get_pixmap()
image_path = os.path.join(file_directory, "page_1.png")
pix.save(image_path)
image = cv2.imread(image_path)
instruction_image = image.copy()

# Globals for mouse interaction
points = []
click_stage = 0
mouse_x, mouse_y = 0, 0

def draw_centered_text(img, text, y_pos):
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 1
    thickness = 2
    color = (0, 0, 0)
    text_size = cv2.getTextSize(text, font, scale, thickness)[0]
    text_x = (img.shape[1] - text_size[0]) // 2
    cv2.putText(img, text, (text_x, y_pos), font, scale, color, thickness)

def update_display():
    display = instruction_image.copy()
    if click_stage == 0:
        draw_centered_text(display, "Click TOP LEFT corner", 50)
    elif click_stage == 1:
        draw_centered_text(display, "Click BOTTOM RIGHT corner", 50)
        cv2.rectangle(display, points[0], (mouse_x, mouse_y), (255, 0, 0), 2)
    cv2.imshow('Image', display)

def mouse_callback(event, x, y, flags, param):
    global click_stage, mouse_x, mouse_y
    mouse_x, mouse_y = x, y
    if event == cv2.EVENT_MOUSEMOVE:
        update_display()
    if event == cv2.EVENT_LBUTTONDOWN:
        points.append((x, y))
        click_stage += 1
        if click_stage == 2:
            x1, y1 = points[0]
            x2, y2 = points[1]
            x_min, x_max = sorted([x1, x2])
            y_min, y_max = sorted([y1, y2])
            crop_image = image[y_min:y_max, x_min:x_max]
            crop_file = os.path.join(file_directory, f"{file_name[:-4]}_crop.png")
            cv2.imwrite(crop_file, crop_image)
            cv2.destroyAllWindows()
            # Save as PDF
            output_pdf = crop_file.replace(".png", ".pdf")
            Image.open(crop_file).convert("RGB").save(output_pdf)
            # Cleanup
            os.remove(crop_file)
            os.remove(image_path)
            doc.close()
            orig_path = f"{pdf_path}-orig"
            os.rename(pdf_path, orig_path)
            os.remove(orig_path)
            print(f"✅ File cropped and saved: {output_pdf}")

# Display window
cv2.namedWindow('Image')
cv2.setMouseCallback('Image', mouse_callback)
update_display()

# Force window fullscreen
hwnd = win32gui.FindWindow(None, 'Image')
win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, 0, 0,
                      win32api.GetSystemMetrics(win32con.SM_CXSCREEN),
                      win32api.GetSystemMetrics(win32con.SM_CYSCREEN),
                      win32con.SWP_SHOWWINDOW)

cv2.waitKey(0)
