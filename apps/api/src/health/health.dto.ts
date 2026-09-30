import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ enum: ['ok'], description: 'API process is up and serving requests' })
  status: 'ok';

  @ApiProperty({ description: 'Seconds since the API process started', minimum: 0 })
  uptimeSeconds: number;
}
