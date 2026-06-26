import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [PrintModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
