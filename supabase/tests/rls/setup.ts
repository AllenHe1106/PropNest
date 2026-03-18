import { truncateAll } from '@propnest/test-utils';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  await truncateAll();
});
