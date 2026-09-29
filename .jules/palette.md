## 2024-05-24 - Missing accessibility in PropertyPhotos
**Learning:** The PropertyPhotos component was missing essential accessibility features, including missing labels for the file and caption inputs, no helpful empty state when photos are missing, and no aria-busy on the upload button.
**Action:** Always ensure that inputs have corresponding `<label>` tags with `htmlFor`, add helpful empty states for empty lists, and provide `aria-busy` states on async buttons for better screen reader and user experience.
