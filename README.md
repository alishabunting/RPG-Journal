# RPG Journal

RPG Journal is a unique journaling application that gamifies real-life experiences using AI-powered quest generation. Transform your daily activities into an epic adventure while maintaining a personal journal.

## Features

- **Character Creation & Customization**
  - Create and customize your character with different classes
  - Visual avatar selection
  - Track character stats (Strength, Intelligence, Dexterity, Charisma)

- **Journal System**
  - Write and maintain daily journal entries
  - Automatic tag generation for entries
  - Chronological entry display with timestamps
  - Rich text formatting support

- **Quest System**
  - Dynamic quest generation based on journal entries
  - Multiple quest categories (Personal, Professional, Social, Health)
  - Quest completion tracking
  - Progress visualization

- **Local Storage**
  - Secure client-side data storage
  - No account required
  - Offline functionality
  - Data persistence between sessions

- **Modern UI/UX**
  - Responsive design for all devices
  - Dark theme optimized interface
  - Interactive components
  - Smooth animations and transitions

## Tech Stack

- React 18
- TypeScript
- Vite
- TailwindCSS
- Radix UI Components
- Local Storage API

## Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/[username]/rpg-journal.git
cd rpg-journal
```

2. Install dependencies:
```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
```

3. Start the development server:
```bash
# From the client directory
npm run dev
```

## Local Development

### Project Structure

```
rpg-journal/
├── client/                # Frontend React application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── lib/         # Utility functions and storage
│   │   └── pages/       # Page components
│   ├── public/          # Static assets
│   └── index.html       # Entry HTML file
```

### Development Commands

- `npm run dev` - Start the development server
- `npm run build` - Build the production bundle
- `npm run preview` - Preview the production build locally

### Code Style

The project uses:
- ESLint for code linting
- Prettier for code formatting
- TypeScript for type checking

### Component Development

- UI components are built using Radix UI primitives
- Styling is done with TailwindCSS
- Components follow atomic design principles
- State management uses React hooks and context

## Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
