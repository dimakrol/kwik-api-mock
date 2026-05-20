import { Module } from '@nestjs/common';
import { CdvController } from './cdv.controller';
import { CdvService } from './cdv.service';

@Module({
  controllers: [CdvController],
  providers: [CdvService],
})
export class CdvModule {}
