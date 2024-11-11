from PIL import Image, ImageDraw, ImageFont
import os

# Create directory if it doesn't exist
os.makedirs('static/images', exist_ok=True)

# Create a new image with a white background
width = 200
height = 200
image = Image.new('RGBA', (width, height), (255, 255, 255, 0))
draw = ImageDraw.Draw(image)

# Draw the letters "CA" in a blue color
try:
    font = ImageFont.truetype("DejaVuSans.ttf", 100)
except:
    font = ImageFont.load_default()

text = "CA"
text_color = (41, 98, 255)  # Blue color
text_width = draw.textlength(text, font=font)
text_x = (width - text_width) // 2
text_y = (height - 100) // 2

draw.text((text_x, text_y), text, font=font, fill=text_color)

# Save the image
image.save('static/images/CA Logo No Background.png', 'PNG')
