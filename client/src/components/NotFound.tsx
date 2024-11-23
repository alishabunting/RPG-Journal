import React from 'react';
import { Link } from 'wouter';

export const NotFound: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <h1 className="text-4xl font-bold mb-4">404 - Quest Not Found</h1>
      <p className="text-lg mb-6">
        Looks like this quest has vanished into the mists of time...
      </p>
      <p className="mb-8 text-gray-600">
        The path you seek may have been completed, abandoned, or never existed.
      </p>
      <Link href="/">
        <a className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
          Return to Your Journey
        </a>
      </Link>
    </div>
  );
};

export default NotFound;
