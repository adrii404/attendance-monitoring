<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Schedule;

class ScheduleSeeder extends Seeder
{
    public function run(): void
    {
        $schedules = [
            [
                'description' => 'Shift 1: 8:00am - 5:00pm',
                'clock_in'    => '08:00:00',
                'clock_out'   => '17:00:00',
            ],
            [
                'description' => 'Shift 2: 9:00am - 6:00pm',
                'clock_in'    => '09:00:00',
                'clock_out'   => '18:00:00',
            ],
            [
                'description' => 'Shift 3: 10:00am - 6:00pm',
                'clock_in'    => '10:00:00',
                'clock_out'   => '18:00:00',
            ],
            [
                'description' => 'Shift 4: 1:00pm - 10:00pm',
                'clock_in'    => '13:00:00',
                'clock_out'   => '22:00:00',
            ],
            [
                'description' => 'Shift 5: 6:00pm - 3:00am',
                'clock_in'    => '18:00:00',
                'clock_out'   => '03:00:00',
            ],
        ];

        foreach ($schedules as $row) {
            Schedule::updateOrCreate(
                ['description' => $row['description']], // unique key
                $row
            );
        }
    }
}
