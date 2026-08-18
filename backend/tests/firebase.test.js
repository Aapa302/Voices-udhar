const path = require('path');
const fs = require('fs');

describe('Firebase Config Initialization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.USE_MOCK_DB;
    process.env.NODE_ENV = 'development';
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('should initialize using FIREBASE_SERVICE_ACCOUNT_PATH file', () => {
    const admin = require('firebase-admin');

    const certMock = jest.spyOn(admin.credential, 'cert').mockImplementation((config) => config);
    const initializeAppMock = jest.spyOn(admin, 'initializeApp').mockImplementation((options) => {
      return { name: '[DEFAULT]', options };
    });
    jest.spyOn(admin, 'firestore').mockImplementation(() => ({}));

    Object.defineProperty(admin, 'apps', {
      get: () => [],
      configurable: true,
    });

    const fakeServiceAccount = {
      project_id: 'test-file-project',
      client_email: 'test@test-file-project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nFAKEKEY\\n-----END PRIVATE KEY-----\\n',
    };

    const tempFilePath = path.join(__dirname, 'temp-service-account.json');
    fs.writeFileSync(tempFilePath, JSON.stringify(fakeServiceAccount));

    try {
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH = tempFilePath;

      const { db, admin: fbAdmin } = require('../src/config/firebase');

      expect(certMock).toHaveBeenCalledWith({
        projectId: 'test-file-project',
        clientEmail: 'test@test-file-project.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----\nFAKEKEY\n-----END PRIVATE KEY-----\n',
      });
      expect(initializeAppMock).toHaveBeenCalledTimes(1);
      const options = initializeAppMock.mock.calls[0][0];

      expect(options.projectId).toBe('test-file-project');
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  });

  test('should initialize using individual environment variables as fallback', () => {
    const admin = require('firebase-admin');

    const certMock = jest.spyOn(admin.credential, 'cert').mockImplementation((config) => config);
    const initializeAppMock = jest.spyOn(admin, 'initializeApp').mockImplementation((options) => {
      return { name: '[DEFAULT]', options };
    });
    jest.spyOn(admin, 'firestore').mockImplementation(() => ({}));

    Object.defineProperty(admin, 'apps', {
      get: () => [],
      configurable: true,
    });

    process.env.FIREBASE_PROJECT_ID = 'test-env-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'env-client@test-env-project.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nFAKEKEY\\n-----END PRIVATE KEY-----';

    const { db, admin: fbAdmin } = require('../src/config/firebase');

    expect(certMock).toHaveBeenCalledWith({
      projectId: 'test-env-project',
      clientEmail: 'env-client@test-env-project.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nFAKEKEY\n-----END PRIVATE KEY-----',
    });
    expect(initializeAppMock).toHaveBeenCalledTimes(1);
    const options = initializeAppMock.mock.calls[0][0];

    expect(options.projectId).toBe('test-env-project');
  });
});
