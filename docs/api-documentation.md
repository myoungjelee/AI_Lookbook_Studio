# AI Virtual Try-On API Documentation

Complete API documentation for the AI Virtual Try-On backend service.

## Base URL

- **Development**: `http://localhost:3001`
- **Production**: `https://your-domain.com`

## Authentication

Currently, no authentication is required. API keys for AI services are configured server-side.

## Content Type

All API requests should use `Content-Type: application/json` unless otherwise specified.

## Rate Limiting

- **Virtual Try-On Generation**: 10 requests per minute per IP
- **Recommendations**: 30 requests per minute per IP
- **Other endpoints**: 100 requests per minute per IP

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "message": "Human-readable error description",
    "code": "ERROR_CODE",
    "field": "fieldName",
    "details": {}
  }
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Authentication required |
| 404 | Not Found - Resource not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |
| 503 | Service Unavailable - AI service unavailable |
| 504 | Gateway Timeout - Request timeout |

### Error Codes

| Code | Description |
|------|-------------|
| `BAD_REQUEST` | Invalid request data |
| `MISSING_REQUIRED_FIELDS` | Required fields are missing |
| `INVALID_FILE_FORMAT` | Unsupported file format |
| `FILE_TOO_LARGE` | File exceeds size limit |
| `VALIDATION_ERROR` | Data validation failed |
| `SERVICE_UNAVAILABLE` | AI service not available |
| `SERVICE_ERROR` | AI service error |
| `TOO_MANY_REQUESTS` | Rate limit exceeded |
| `GATEWAY_TIMEOUT` | Request timeout |
| `INTERNAL_SERVER_ERROR` | Unexpected server error |

## Data Types

### ApiFile

Represents an uploaded image file:

```typescript
interface ApiFile {
  base64: string;    // Base64 encoded image data (without data URI prefix)
  mimeType: string;  // MIME type: 'image/jpeg', 'image/png', 'image/webp'
}
```

### ClothingItems

Represents clothing items for virtual try-on:

```typescript
interface ClothingItems {
  top?: ApiFile | null;     // Top clothing item (shirt, jacket, etc.)
  pants?: ApiFile | null;   // Pants clothing item
  shoes?: ApiFile | null;   // Shoes clothing item
}
```

### RecommendationItem

Represents a product recommendation:

```typescript
interface RecommendationItem {
  id: string;           // Unique product identifier
  title: string;        // Product name
  price: number;        // Price in cents (KRW)
  imageUrl?: string;    // Product image URL
  score?: number;       // Recommendation score (0-1)
  tags: string[];       // Product tags
  category: string;     // Product category
}
```

## Endpoints

### Health Check

#### GET /health

Check server health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

---

### Virtual Try-On Generation

#### POST /api/generate

Generate a virtual try-on image by combining a person image with clothing items.

**Request Body:**
```json
{
  "person": {
    "base64": "base64_encoded_image_data",
    "mimeType": "image/jpeg"
  },
  "clothingItems": {
    "top": {
      "base64": "base64_encoded_image_data",
      "mimeType": "image/jpeg"
    },
    "pants": {
      "base64": "base64_encoded_image_data",
      "mimeType": "image/png"
    },
    "shoes": {
      "base64": "base64_encoded_image_data",
      "mimeType": "image/webp"
    }
  }
}
```

**Response (200):**
```json
{
  "generatedImage": "data:image/jpeg;base64,generated_image_data",
  "requestId": "req_1234567890_abc123",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Validation Rules:**
- `person` is required
- At least one clothing item is required
- Supported image formats: JPEG, PNG, WebP
- Maximum file size: 10MB per image
- Base64 data should not include data URI prefix

**Example cURL:**
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "person": {
      "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
      "mimeType": "image/jpeg"
    },
    "clothingItems": {
      "top": {
        "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
        "mimeType": "image/jpeg"
      }
    }
  }'
```

#### GET /api/generate/status

Get virtual try-on service status.

**Response (200):**
```json
{
  "available": true,
  "config": {
    "model": "gemini-2.5-flash-image-preview",
    "timeout": 30000,
    "maxRetries": 3,
    "isConfigured": true
  }
}
```

---

### Product Recommendations

#### POST /api/recommend

Generate product recommendations based on uploaded images.

**Request Body:**
```json
{
  "person": {
    "base64": "base64_encoded_image_data",
    "mimeType": "image/jpeg"
  },
  "clothingItems": {
    "top": {
      "base64": "base64_encoded_image_data",
      "mimeType": "image/jpeg"
    }
  },
  "options": {
    "maxPerCategory": 3,
    "minPrice": 20000,
    "maxPrice": 100000,
    "excludeTags": ["expensive", "formal"]
  }
}
```

**Request Parameters:**
- `person` (optional): Person image for style analysis
- `clothingItems` (optional): Clothing items for style analysis
- `options` (optional): Recommendation options
  - `maxPerCategory` (number): Maximum recommendations per category (default: 3)
  - `minPrice` (number): Minimum price filter in cents
  - `maxPrice` (number): Maximum price filter in cents
  - `excludeTags` (string[]): Tags to exclude from recommendations

**Response (200):**
```json
{
  "recommendations": {
    "top": [
      {
        "id": "top_001",
        "title": "Casual Cotton T-Shirt",
        "price": 25000,
        "imageUrl": "https://example.com/image.jpg",
        "tags": ["casual", "cotton", "basic"],
        "category": "top"
      }
    ],
    "pants": [
      {
        "id": "pants_001",
        "title": "Casual Jeans",
        "price": 79000,
        "imageUrl": "https://example.com/jeans.jpg",
        "tags": ["casual", "denim"],
        "category": "pants"
      }
    ],
    "shoes": [],
    "accessories": []
  },
  "analysisMethod": "ai",
  "styleAnalysis": {
    "detected_style": ["casual", "street"],
    "colors": ["black", "white"],
    "categories": ["top"],
    "style_preference": ["casual", "comfortable"]
  },
  "requestId": "req_1234567890_abc123",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Validation Rules:**
- At least `person` or `clothingItems` is required
- Same image format and size restrictions as virtual try-on

#### POST /api/recommend/from-fitting

Generate recommendations based on a virtual try-on result image.

**Request Body:**
```json
{
  "generatedImage": "data:image/jpeg;base64,generated_image_data",
  "originalClothingItems": {
    "top": {
      "base64": "base64_encoded_image_data",
      "mimeType": "image/jpeg"
    }
  },
  "options": {
    "maxPerCategory": 4,
    "minPrice": 30000,
    "maxPrice": 150000
  }
}
```

**Request Parameters:**
- `generatedImage` (required): Base64 data URI of virtual try-on result
- `originalClothingItems` (optional): Original clothing items used in virtual try-on
- `options` (optional): Same as `/api/recommend`

**Response (200):**
```json
{
  "recommendations": {
    "top": [...],
    "pants": [...],
    "shoes": [...],
    "accessories": [...]
  },
  "analysisMethod": "ai",
  "clothingAnalysis": {
    "top": ["black", "hoodie", "oversized"],
    "pants": ["blue", "jeans", "straight"],
    "shoes": ["white", "sneakers"],
    "overall_style": ["casual", "street"]
  },
  "requestId": "req_1234567890_abc123",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### GET /api/recommend/catalog

Get product catalog statistics.

**Response (200):**
```json
{
  "totalProducts": 150,
  "categories": {
    "top": 45,
    "pants": 35,
    "shoes": 40,
    "accessories": 30
  },
  "priceRange": {
    "min": 15000,
    "max": 250000,
    "average": 65000
  }
}
```

#### GET /api/recommend/status

Get recommendation service status.

**Response (200):**
```json
{
  "aiService": {
    "available": true,
    "config": {
      "deploymentId": "gpt-4-vision-preview",
      "timeout": 30000,
      "isConfigured": true
    }
  },
  "catalogService": {
    "available": true,
    "productCount": 150
  }
}
```

---

## Usage Examples

### JavaScript/TypeScript

```typescript
// Virtual Try-On Generation
const generateVirtualTryOn = async (personImage: File, topImage: File) => {
  const personBase64 = await fileToBase64(personImage);
  const topBase64 = await fileToBase64(topImage);
  
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      person: {
        base64: personBase64,
        mimeType: personImage.type
      },
      clothingItems: {
        top: {
          base64: topBase64,
          mimeType: topImage.type
        }
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }
  
  return await response.json();
};

// Get Recommendations
const getRecommendations = async (personImage: File) => {
  const personBase64 = await fileToBase64(personImage);
  
  const response = await fetch('/api/recommend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      person: {
        base64: personBase64,
        mimeType: personImage.type
      },
      options: {
        maxPerCategory: 5,
        maxPrice: 100000
      }
    })
  });
  
  return await response.json();
};

// Helper function
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URI prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
```

### Python

```python
import requests
import base64
import json

def generate_virtual_try_on(person_image_path, top_image_path):
    # Read and encode images
    with open(person_image_path, 'rb') as f:
        person_base64 = base64.b64encode(f.read()).decode('utf-8')
    
    with open(top_image_path, 'rb') as f:
        top_base64 = base64.b64encode(f.read()).decode('utf-8')
    
    # Prepare request
    payload = {
        'person': {
            'base64': person_base64,
            'mimeType': 'image/jpeg'
        },
        'clothingItems': {
            'top': {
                'base64': top_base64,
                'mimeType': 'image/jpeg'
            }
        }
    }
    
    # Make request
    response = requests.post(
        'http://localhost:3001/api/generate',
        headers={'Content-Type': 'application/json'},
        json=payload
    )
    
    if response.status_code == 200:
        return response.json()
    else:
        error = response.json()
        raise Exception(f"API Error: {error['error']['message']}")

# Usage
try:
    result = generate_virtual_try_on('person.jpg', 'shirt.jpg')
    print(f"Generated image: {result['generatedImage'][:50]}...")
except Exception as e:
    print(f"Error: {e}")
```

## Best Practices

### Image Optimization

1. **Compress images** before sending to reduce payload size
2. **Use appropriate formats**: JPEG for photos, PNG for graphics
3. **Resize images** to reasonable dimensions (max 2048x2048)
4. **Validate file types** on client-side before upload

### Error Handling

1. **Always check response status** before processing data
2. **Handle network errors** gracefully
3. **Show user-friendly error messages**
4. **Implement retry logic** for transient errors

### Performance

1. **Implement request timeouts** (30-60 seconds for AI operations)
2. **Show loading indicators** for long-running operations
3. **Cache results** when appropriate
4. **Use request debouncing** for user input

### Security

1. **Validate file types** and sizes on both client and server
2. **Sanitize user inputs** before processing
3. **Implement rate limiting** on client-side
4. **Use HTTPS** in production

## Changelog

### v1.0.0 (2024-01-15)
- Initial API release
- Virtual try-on generation endpoint
- Product recommendation endpoints
- Health check and status endpoints
- Comprehensive error handling

## Support

For API support and questions:
- Check the troubleshooting section in the main README
- Review error codes and messages
- Test with the provided examples
- Contact the development team for additional support
