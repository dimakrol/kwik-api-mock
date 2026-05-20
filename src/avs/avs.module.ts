import { Module } from '@nestjs/common';
import { AvsController } from './avs.controller';
import { AvsService } from './avs.service';

@Module({
  controllers: [AvsController],
  providers: [AvsService],
})
export class AvsModule {}
