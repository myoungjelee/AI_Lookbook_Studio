# Azure Computer Vision 설정 가이드

## 🎯 개요

이 가이드는 이미지 기반 추천 시스템에서 Azure Computer Vision과 Azure OpenAI를 설정하는 방법을 설명합니다.

## 📋 필요한 Azure 서비스

### 1. Azure OpenAI Service (추천)
- **용도**: 이미지 분석 및 시각적 특징 추출
- **모델**: GPT-4 Vision Preview 또는 GPT-4o
- **장점**: 고품질 이미지 분석, 자연어 응답

### 2. Azure Computer Vision (대안)
- **용도**: 기본적인 이미지 분석
- **장점**: 빠른 처리, 저렴한 비용

## 🚀 Azure Computer Vision 설정 (추천)

### Step 1: Azure Computer Vision 리소스 생성

1. **Azure Portal** (https://portal.azure.com) 접속
2. **리소스 만들기** → **AI + Machine Learning** → **Computer Vision**
3. 다음 정보 입력:
   - **구독**: 사용할 구독 선택
   - **리소스 그룹**: 새로 만들거나 기존 그룹 선택 (예: `fashion-ai-rg`)
   - **지역**: Korea Central 또는 East US
   - **이름**: 고유한 리소스 이름 (예: `fashion-computer-vision`)
   - **가격 책정 계층**: F0 (무료) 또는 S1 (유료)

### Step 2: 키 및 엔드포인트 확인

리소스 생성 후:
1. **키 및 엔드포인트** 메뉴로 이동
2. 다음 정보 복사:
   - **키 1** (API Key)
   - **엔드포인트** (예: https://your-resource.cognitiveservices.azure.com/)

### Step 3: 환경 변수 설정

`.env` 파일에 다음 내용 추가:

```env
# Azure Computer Vision Configuration
AZURE_COMPUTER_VISION_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_COMPUTER_VISION_KEY=your-api-key-here
```

## 🔧 Azure Computer Vision 설정 (대안)

### Step 1: Computer Vision 리소스 생성

1. **Azure Portal** 접속
2. **리소스 만들기** → **AI + Machine Learning** → **Computer Vision**
3. 리소스 정보 입력:
   - **구독**: 사용할 구독
   - **리소스 그룹**: 선택
   - **지역**: Korea Central
   - **이름**: `fashion-computer-vision`
   - **가격 책정 계층**: F0 (무료) 또는 S1

### Step 2: 환경 변수 설정

```env
# Azure Computer Vision Configuration
AZURE_COMPUTER_VISION_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_COMPUTER_VISION_KEY=your-computer-vision-key
```

## 💰 비용 예상

### Azure OpenAI (GPT-4 Vision)
- **입력**: $0.01 per 1K tokens
- **출력**: $0.03 per 1K tokens
- **이미지**: $0.00765 per image (high detail)

**예상 비용 (월 1000회 요청)**:
- 이미지 분석: ~$7.65
- 텍스트 처리: ~$2-5
- **총 예상**: ~$10-15/월

### Azure Computer Vision
- **분석 API**: $1 per 1,000 transactions
- **월 1000회**: ~$1/월

## 🧪 테스트 방법

### 1. 설정 확인

```bash
# Health check
curl http://localhost:3001/api/recommend-visual/health
```

### 2. Azure 연결 테스트

```bash
# Azure provider 강제 사용
curl -X POST http://localhost:3001/api/recommend-visual \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQ...",
    "options": {
      "provider": "azure",
      "maxResults": 3
    }
  }'
```

### 3. 실제 이미지 테스트

실제 의류 이미지를 base64로 인코딩하여 테스트:

```javascript
// 브라우저 콘솔에서 실행
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.onchange = (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    console.log('Base64 image:', base64);
    // 이 base64를 API 테스트에 사용
  };
  reader.readAsDataURL(file);
};
fileInput.click();
```

## 🔍 성능 최적화

### 1. 이미지 크기 최적화
- **권장 크기**: 512x512 이하
- **파일 크기**: 4MB 이하
- **형식**: JPEG, PNG

### 2. 요청 최적화
- **배치 처리**: 여러 이미지를 한 번에 처리
- **캐싱**: 동일한 이미지 결과 캐시
- **압축**: 이미지 품질 조정

### 3. 비용 최적화
- **이미지 전처리**: 불필요한 영역 제거
- **결과 캐싱**: 동일한 요청 결과 재사용
- **배치 크기 조정**: 적절한 배치 크기 설정

## 🚨 문제 해결

### 일반적인 오류

1. **401 Unauthorized**
   - API 키 확인
   - 엔드포인트 URL 확인

2. **403 Forbidden**
   - 구독 상태 확인
   - 할당량 초과 여부 확인

3. **429 Too Many Requests**
   - 요청 속도 제한
   - 재시도 로직 구현

4. **모델을 찾을 수 없음**
   - 배포 이름 확인
   - 모델 배포 상태 확인

### 디버깅 팁

```javascript
// 상세한 로그 활성화
process.env.DEBUG = 'azure:*';

// 요청/응답 로깅
console.log('Request:', payload);
console.log('Response:', result);
```

## 📊 모니터링

### Azure Portal에서 확인
1. **메트릭**: 요청 수, 응답 시간, 오류율
2. **로그**: 상세한 요청 로그
3. **알림**: 임계값 초과 시 알림 설정

### 애플리케이션 로그
```javascript
// 성능 메트릭 수집
const startTime = Date.now();
const result = await azureVisionService.analyzeImage(image);
const processingTime = Date.now() - startTime;

console.log(`Azure processing time: ${processingTime}ms`);
```

## 🎯 다음 단계

1. ✅ Azure 리소스 생성 및 설정
2. ✅ 환경 변수 구성
3. ✅ 기본 연결 테스트
4. 🔄 실제 이미지로 정확도 테스트
5. 🔄 성능 최적화 및 모니터링 설정
6. 🔄 프론트엔드 통합

---

**💡 팁**: 개발 초기에는 Azure OpenAI의 무료 크레딧을 활용하고, 프로덕션에서는 비용 최적화를 고려하세요!
