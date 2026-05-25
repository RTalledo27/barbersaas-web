import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.css'
})
export class AuthShellComponent {
  currentYear = new Date().getFullYear();

}


