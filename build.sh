#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting the build process for haxball-client..."

# Navigate to the haxball-client directory
# (Adjust this path if your client is located elsewhere)
cd haxball-client

# Install dependencies (uncomment if you use npm or yarn)
# npm install
# yarn install

# Compile the project
# (Replace 'npm run build' with your actual build command, e.g., 'make', 'gulp', etc.)
echo "Compiling the project..."
npm run build

# Create a directory for the build artifacts if it doesn't exist
# (Adjust 'dist' to your actual build output folder)
BUILD_DIR="dist"
if [ ! -d "$BUILD_DIR" ]; then
  echo "Build directory '$BUILD_DIR' not found. Please check your build configuration."
  exit 1
fi

# Navigate back to the root directory
cd ..

# Create a destination directory in the root if it doesn't exist
DEST_DIR="built_exes"
mkdir -p "$DEST_DIR"

# Find and move all .exe files from the build directory to the destination
echo "Moving .exe files to $DEST_DIR/..."
find "haxball-client/$BUILD_DIR" -type f -name "*.exe" -exec cp {} "$DEST_DIR/" \;

echo "Build process completed successfully!"
echo "Your .exe files are now located in the $DEST_DIR folder."
