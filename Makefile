.PHONY: run clean build install deploy setup help

# Setup theme files (copy custom configurations)
setup:
	@echo "Copying custom configuration files..."
	cp ../my-blog-config/conf/* . 2>/dev/null || true
	cp ../my-blog-config/js/* ./node_modules/hexo-theme-icarus/scripts/ 2>/dev/null || true
	cp ../my-blog-config/img/* ./node_modules/hexo-theme-icarus/source/img/ 2>/dev/null || true
	cp ../my-blog-config/css/custom.styl ./node_modules/hexo-theme-icarus/source/css/
	@echo "@import 'custom'" >> ./node_modules/hexo-theme-icarus/source/css/default.styl
	@echo "Configuration files copied successfully!"

# Start development server (with setup)
run: setup
	npm run server

# Clean cache and regenerate static files
clean: setup
	npm run clean
	npm run build

# Generate static files only
build:
	npm run build

# Install dependencies
install:
	npm install

# Deploy (if configured)
deploy:
	npm run deploy

# Show available commands
help:
	@echo "Available commands:"
	@echo "  make setup   - Copy custom configuration files to theme"
	@echo "  make run     - Setup and start development server"
	@echo "  make clean   - Setup, clean cache and regenerate static files"
	@echo "  make build   - Generate static files"
	@echo "  make install - Install dependencies"
	@echo "  make deploy  - Deploy website"
	@echo "  make help    - Show this help"

# Default command
default: help