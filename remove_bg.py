from PIL import Image

def remove_black_background(input_path, output_path, tolerance=50):
    img = Image.open(input_path)
    img = img.convert("RGBA")
    
    datas = img.getdata()
    newData = []
    
    for item in datas:
        # Check if the pixel is near black
        if item[0] < tolerance and item[1] < tolerance and item[2] < tolerance:
            # Change near-black to transparent
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    img.save(output_path, "PNG")
    print(f"Saved transparent image to {output_path}")

remove_black_background('client/images/logo.jpg', 'client/images/logo.png', tolerance=80)
