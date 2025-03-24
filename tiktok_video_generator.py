import os
import random
from moviepy.editor import ImageClip, AudioFileClip, CompositeVideoClip

# Function to get a random file from a directory
def get_random_file(directory, extensions):
    files = [f for f in os.listdir(directory) if f.lower().endswith(tuple(extensions))]
    if not files:
        raise FileNotFoundError(f"No files with extensions {extensions} found in {directory}")
    return os.path.join(directory, random.choice(files))

# Function to create a TikTok-style video
def create_tiktok_video(image_path, audio_path, output_path, duration=60):
    # Load image and audio
    image_clip = ImageClip(image_path).set_duration(duration).resize(width=720).set_position("center")
    audio_clip = AudioFileClip(audio_path)

    # Calculate a random start time for the audio
    max_start_time = max(0, audio_clip.duration - duration)
    start_time = random.uniform(0, max_start_time)
    audio_clip = audio_clip.subclip(start_time, start_time + duration)

    # Create the final video clip
    video_clip = CompositeVideoClip([image_clip.set_audio(audio_clip)], size=(720, 1280))

    # Write the output video file
    video_clip.write_videofile(output_path, codec='libx264', fps=30)

# Main function
def main():
    # Directories for images and songs
    images_dir = "path/to/your/images"
    songs_dir = "path/to/your/songs"
    output_dir = "path/to/your/output"

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    # Get random image and song
    image_path = get_random_file(images_dir, [".jpg", ".jpeg", ".png"])
    song_path = get_random_file(songs_dir, [".mp3", ".wav", ".m4a"])

    # Generate unique output filename
    output_path = os.path.join(output_dir, f"tiktok_video_{random.randint(1000, 9999)}.mp4")

    # Create the video
    create_tiktok_video(image_path, song_path, output_path)
    print(f"Video created successfully: {output_path}")

# Run the main function
if __name__ == "__main__":
    main()
