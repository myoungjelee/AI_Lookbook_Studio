# AI Virtual Try-On Frontend

React-based frontend application for the AI Virtual Try-On system, providing an intuitive interface for virtual clothing try-on and product recommendations.

## Features

- **Virtual Try-On**: Upload person and clothing images to generate virtual try-on results
- **Product Recommendations**: Get AI-powered product recommendations based on style analysis
- **Responsive Design**: Mobile-first responsive design with Tailwind CSS
- **Real-time Processing**: Live feedback during image processing and generation
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Accessibility**: WCAG compliant interface with keyboard navigation support

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Testing**: Vitest, React Testing Library
- **Development**: ESLint, PostCSS

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Backend API server running

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env
   ```

4. **Configure environment variables**
   Edit `.env` file:
   ```env
   # API Configuration
   VITE_API_URL=http://localhost:3001
   
   # Environment
   NODE_ENV=development
   ```

## Development

### Start Development Server
```bash
npm run dev
```

The application will start on `http://localhost:5173` with hot reload enabled.

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:analyze` - Build with bundle analyzer
- `npm run preview` - Preview production build
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## Usage

### Basic Workflow

1. **Upload Person Image**
   - Click "Upload Person Image" or drag and drop
   - Supported formats: JPEG, PNG, WebP
   - Maximum size: 10MB

2. **Upload Clothing Items**
   - Add clothing items (top, pants, shoes)
   - Multiple items can be combined
   - Preview images before processing

3. **Generate Virtual Try-On**
   - Click "Generate Virtual Try-On"
   - Wait for AI processing (typically 10-30 seconds)
   - View the generated result

4. **Get Recommendations**
   - Automatically get recommendations based on the result
   - Browse recommended products by category
   - Filter by price, style, or category

### Image Requirements

- **Format**: JPEG, PNG, or WebP
- **Size**: Maximum 10MB per image
- **Resolution**: Minimum 256x256 pixels recommended
- **Quality**: Higher quality images produce better results

## Component Architecture

### UI Components (`src/components/ui/`)

Reusable UI components following design system principles:

- `Button` - Configurable button component
- `Modal` - Accessible modal dialogs
- `Input` - Form input components
- `Card` - Content containers
- `Spinner` - Loading indicators
- `Toast` - Notification messages
- `ErrorBoundary` - Error handling wrapper

### Feature Components (`src/components/features/`)

Business logic components organized by feature:

- `virtual-try-on/` - Virtual try-on interface
- `recommendations/` - Product recommendation display
- `ecommerce/` - E-commerce related components
- `layout/` - Layout and navigation components

### Hooks (`src/hooks/`)

Custom React hooks for state management and API integration:

- `useApi` - Generic API call management
- `useVirtualTryOn` - Virtual try-on state management
- `useApiWithErrorHandling` - API calls with error handling

### Services (`src/services/`)

API integration and external service communication:

- `api.service.ts` - HTTP client and API methods
- `virtualTryOn.service.ts` - Virtual try-on specific API calls

## Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Test Structure
```
src/
├── test/
│   ├── setup.ts           # Test configuration
│   ├── utils.tsx          # Test utilities
│   └── mocks.ts           # Mock data and functions
├── components/
│   └── **/__tests__/      # Component tests
├── hooks/
│   └── **/__tests__/      # Hook tests
└── services/
    └── **/__tests__/      # Service tests
```

### Writing Tests

#### Component Tests
```typescript
import { render, screen, user } from '../../test/utils';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

#### Hook Tests
```typescript
import { renderHook, act } from '@testing-library/react';
import { useApi } from '../useApi';

describe('useApi', () => {
  it('should handle API calls', async () => {
    const { result } = renderHook(() => useApi());
    
    await act(async () => {
      await result.current.execute(() => Promise.resolve({ data: 'test' }));
    });
    
    expect(result.current.data).toEqual({ data: 'test' });
  });
});
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                    # Reusable UI components
│   │   ├── features/              # Feature-specific components
│   │   └── icons/                 # Icon components
│   ├── hooks/                     # Custom React hooks
│   ├── services/                  # API services
│   ├── utils/                     # Utility functions
│   ├── styles/                    # Global styles
│   ├── test/                      # Test utilities
│   ├── types.ts                   # TypeScript type definitions
│   ├── App.tsx                    # Main app component
│   └── main.tsx                   # React entry point
├── public/                        # Static assets
├── dist/                          # Build output
├── tests/                         # Additional test files
├── package.json
├── vite.config.ts                 # Vite configuration
├── tailwind.config.js             # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
└── README.md
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_API_URL` | Backend API base URL | No | http://localhost:3001 |
| `NODE_ENV` | Environment (development/production) | No | development |

### Vite Configuration

The Vite configuration includes:
- React plugin for JSX support
- Proxy configuration for API calls
- Build optimizations
- Test configuration

### Tailwind CSS

Custom Tailwind configuration with:
- Design system colors and spacing
- Component utilities
- Responsive breakpoints
- Dark mode support (future)

## API Integration

### API Client

The application uses a centralized API client with:
- Request/response interceptors
- Error handling
- Timeout management
- Retry logic

### Error Handling

Comprehensive error handling at multiple levels:
- Network errors
- API errors
- Validation errors
- User-friendly error messages

### Loading States

Loading states are managed consistently across the application:
- Button loading states
- Page-level loading indicators
- Skeleton loading for content

## Deployment

### Production Build
```bash
npm run build
```

The build output will be in the `dist/` directory.

### Docker Deployment
```bash
# Build image
docker build -t ai-virtual-try-on-frontend .

# Run container
docker run -p 80:80 ai-virtual-try-on-frontend
```

### Static Hosting

The application can be deployed to any static hosting service:

#### Vercel
```bash
npm install -g vercel
vercel --prod
```

#### Netlify
```bash
npm run build
# Upload dist/ folder to Netlify
```

#### AWS S3 + CloudFront
```bash
npm run build
aws s3 sync dist/ s3://your-bucket-name
```

### Environment-specific Builds

#### Development
```bash
npm run dev
```

#### Staging
```bash
VITE_API_URL=https://staging-api.example.com npm run build
```

#### Production
```bash
VITE_API_URL=https://api.example.com npm run build
```

## Performance Optimization

### Bundle Optimization
- Code splitting by route and feature
- Tree shaking for unused code
- Asset optimization and compression
- Lazy loading for heavy components

### Image Optimization
- WebP format support
- Image compression before upload
- Progressive loading
- Responsive images

### Caching Strategy
- Service worker for offline support (future)
- API response caching
- Static asset caching
- Browser caching headers

## Accessibility

The application follows WCAG 2.1 AA guidelines:
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus management
- Semantic HTML structure

### Testing Accessibility
```bash
# Run accessibility tests
npm run test:a11y
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Troubleshooting

### Common Issues

1. **"Network Error" when uploading images**
   - Check if backend server is running
   - Verify API URL in environment variables
   - Check browser network tab for CORS issues

2. **Images not displaying correctly**
   - Ensure images are in supported formats
   - Check image file size (max 10MB)
   - Verify base64 encoding is working

3. **Slow performance**
   - Check image sizes (compress large images)
   - Monitor network requests in dev tools
   - Check for memory leaks in React components

4. **Build failures**
   - Clear node_modules and reinstall dependencies
   - Check TypeScript errors
   - Verify environment variables are set

### Debug Mode

Enable debug mode by setting:
```env
VITE_DEBUG=true
```

This will show additional logging and debug information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run tests and linting
6. Submit a pull request

### Code Style

- Use TypeScript for all new code
- Follow ESLint configuration
- Use Prettier for code formatting
- Write tests for new components and hooks
- Follow component naming conventions

## License

This project is licensed under the ISC License.
