import { Global, Injectable, Module } from '@nestjs/common';

/**
 * Current time. Inject Clock instead of calling `new Date()` / `Date.now()` in services, so tests control time
 * (expiry, deadlines) without fake timers. Pure domain functions take `now: Date` as a parameter.
 */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
